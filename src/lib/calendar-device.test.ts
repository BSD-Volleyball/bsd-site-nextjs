import { describe, expect, it } from "vitest"
import { detectCalendarDevice, devicePlan } from "./calendar-device"

const UA = {
    iphoneSafari:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    iphoneChrome:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1",
    ipadAsMac:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    androidChrome:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
    macChrome:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    windowsEdge:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
    linuxFirefox:
        "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"
}

describe("detectCalendarDevice", () => {
    it("separates Safari from other browsers on iOS", () => {
        expect(detectCalendarDevice({ userAgent: UA.iphoneSafari })).toBe(
            "ios-safari"
        )
        expect(detectCalendarDevice({ userAgent: UA.iphoneChrome })).toBe(
            "ios-other"
        )
    })

    it("treats a touch-capable 'Macintosh' as an iPad, a plain one as a Mac", () => {
        expect(
            detectCalendarDevice({ userAgent: UA.ipadAsMac, maxTouchPoints: 5 })
        ).toBe("ios-safari")
        expect(
            detectCalendarDevice({ userAgent: UA.macChrome, maxTouchPoints: 0 })
        ).toBe("mac")
    })

    it("detects Android, Windows and falls back to other", () => {
        expect(detectCalendarDevice({ userAgent: UA.androidChrome })).toBe(
            "android"
        )
        expect(detectCalendarDevice({ userAgent: UA.windowsEdge })).toBe(
            "windows"
        )
        expect(detectCalendarDevice({ userAgent: UA.linuxFirefox })).toBe(
            "other"
        )
    })

    it("honours a reduced UA via the platform hint", () => {
        expect(
            detectCalendarDevice({
                userAgent: "Mozilla/5.0",
                platform: "Windows"
            })
        ).toBe("windows")
        expect(
            detectCalendarDevice({
                userAgent: "Mozilla/5.0",
                platform: "Android"
            })
        ).toBe("android")
    })
})

describe("devicePlan", () => {
    it("always lists every platform, recommending the native one first", () => {
        for (const device of [
            "ios-safari",
            "ios-other",
            "android",
            "mac",
            "windows",
            "other"
        ] as const) {
            const plan = devicePlan(device)
            expect([...plan.order].sort()).toEqual([
                "apple",
                "google",
                "ms365",
                "outlook"
            ])
        }
        expect(devicePlan("ios-safari").order[0]).toBe("apple")
        expect(devicePlan("mac").order[0]).toBe("apple")
        expect(devicePlan("android").order[0]).toBe("google")
        expect(devicePlan("windows").order[0]).toBe("outlook")
    })

    it("flags devices where the bare webcal link has no handler", () => {
        expect(devicePlan("ios-other").webcalUnsupported).toBe(true)
        expect(devicePlan("android").webcalUnsupported).toBe(true)
        expect(devicePlan("ios-safari").webcalUnsupported).toBe(false)
        expect(devicePlan("mac").webcalUnsupported).toBe(false)
        expect(devicePlan("ios-other").hint).toMatch(/Add Subscribed Calendar/)
    })
})
