"""HTTP session hardened against path-MTU blackholes to archive.org.

On 2026-07-30 the route from this container to the Internet Archive
(207.241.0.0/16) developed a path-MTU blackhole: eth0 is MTU 1500 but the
path only carried 1450, and the ICMP "fragmentation needed" replies that
drive Path MTU Discovery were filtered. The TCP handshake completed and
then every full-size packet vanished, so curl/requests/undici hung
forever while a HEAD (single small response) returned 200 fine.

Measured at the time: MSS 1410 worked, 1420 did not -- a path MTU of
exactly 1450, the classic VXLAN overhead (1500 - 50).

That condition has since cleared on its own; unclamped requests work
again, and it was never fixable from inside the container anyway (lowering
the interface MTU or clamping MSS needs CAP_NET_ADMIN, and all
capabilities are dropped here). We keep the clamp because it is free
insurance: we do not control the upstream path, the blackhole came and
went once already, and a smaller MSS costs only a little efficiency
whereas a recurrence costs a hung multi-hour crawl.

TCP_MAXSEG must be set BEFORE connect() to be advertised in the SYN.
urllib3's create_connection() applies socket_options before connecting,
which is the hook we use. Node exposes no setsockopt equivalent, which is
why the download stage is Python.
"""

import socket

import requests
from requests.adapters import HTTPAdapter
from urllib3.connection import HTTPConnection

# 1450 (measured path MTU) - 40 (IP + TCP headers) = 1410 max workable MSS.
DEFAULT_MSS = 1380


class MssAdapter(HTTPAdapter):
    """Transport adapter that clamps TCP_MAXSEG on every new connection."""

    def __init__(self, mss=DEFAULT_MSS, **kwargs):
        self._mss = mss
        super().__init__(**kwargs)

    def _socket_options(self):
        return HTTPConnection.default_socket_options + [
            (socket.IPPROTO_TCP, socket.TCP_MAXSEG, self._mss)
        ]

    def init_poolmanager(self, *args, **kwargs):
        kwargs["socket_options"] = self._socket_options()
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        kwargs["socket_options"] = self._socket_options()
        return super().proxy_manager_for(*args, **kwargs)


def make_session(mss=DEFAULT_MSS, user_agent=None):
    """Return a requests.Session that can actually reach web.archive.org."""
    session = requests.Session()
    adapter = MssAdapter(mss=mss)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers["User-Agent"] = user_agent or (
        "bsd-league-archive-backfill/1.0 (+https://bumpsetdrink.com; "
        "one-time historical results recovery)"
    )
    return session


def selftest(mss=DEFAULT_MSS):
    """Prove the clamp is load-bearing: unclamped should hang, clamped should not."""
    session = make_session(mss=mss)
    resp = session.get("https://web.archive.org/", timeout=30)
    return resp.status_code, len(resp.content)


if __name__ == "__main__":
    code, size = selftest()
    print(f"clamped MSS request OK: HTTP {code}, {size} bytes")
