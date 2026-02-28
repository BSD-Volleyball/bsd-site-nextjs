-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
    id serial PRIMARY KEY NOT NULL,
    name text NOT NULL,
    subject text,
    content jsonb NOT NULL,
    created_at timestamp NOT NULL,
    updated_at timestamp NOT NULL,
    CONSTRAINT email_templates_name_unique UNIQUE(name)
);

-- Insert the "call for captains" template
INSERT INTO email_templates (name, subject, content, created_at, updated_at)
VALUES (
    'call for captains',
    'Call for Team Captains',
    jsonb_build_object(
        'root',
        jsonb_build_object(
            'type', 'root',
            'direction', NULL,
            'format', '',
            'indent', 0,
            'version', 1,
            'children', jsonb_build_array(
                jsonb_build_object(
                    'type', 'paragraph',
                    'direction', NULL,
                    'format', '',
                    'indent', 0,
                    'version', 1,
                    'children', jsonb_build_array(
                        jsonb_build_object(
                            'type', 'text',
                            'detail', 0,
                            'format', 0,
                            'mode', 'normal',
                            'style', '',
                            'text', 'Hi Folks,

Thank you all for continuing to play BSD Volleyball this season.  Jack Griffith and I are the AA Division Commissioners for the Fall 2025 Season, and we are actively recruiting Team Captains!  You are receiving this email because you volunteered to be a Captain during your registration, or we think you are a good candidate for a Captain.

The top 5 Divisions [AA, A, ABA, ABB, and BBB] will draft six teams per division.  The BB division will draft four teams.

I hope you will volunteer to be a Captain this season.  Please let us know ASAP so we don''t have to chase you down via text or phone.  (I will be on vacation in sunny Amelia Island, Florida, later this week, so please also copy Jack on your replies!)

Requirements for Captains:

1.     We prefer you attend all three preseason sessions on August 14, 21, and 28 from 7:00 to 10:00 p.m.
We do, on occasion, accept Captains who cannot attend one of the tryouts.  If you cannot participate in a tryout, please indicate this in your response.


2.     You must be available to draft your team or arrange for someone else to handle the draft in your absence.

AA Draft

THU August 28 (after the first two preseason matches)
A Draft

TUE September 2

ABA Draft

THU September 4

ABB Draft

SUN September 7
BBB Draft

MON September 8

BB Draft

TUE September 9


If you cannot attend the draft in person, we can accommodate drafting over the phone or FaceTime.


3.     You must be willing to evaluate players at the preseason tryouts, take good notes, and provide feedback to the Commissioners.
The captain''s feedback will help seed players in the Preseason Auto-Drafts in this new Preseason format.  Your opinions matter!


Standard Disclaimers from the BSD Lawyers (LOL):

Nobody is "guaranteed" to be a captain at this point.  If more than six players are willing to be captains, the Division Commissioners will select based on factors supporting the most competitive division.
You do not have to be the best player on your team to be a good captain.  You must have a good attitude, organizational skills, and the willingness to evaluate and draft other players.
Captains will be placed on Preseason Teams and are expected to play. They are eligible to be drafted at higher levels of play.

Jack and I intend to make captain selections by Monday, August 11th.
Thanks for reading this long email.  Please let us know your decision either way!',
                            'version', 1
                        )
                    )
                )
            )
        )
    ),
    NOW(),
    NOW()
)
ON CONFLICT (name) DO NOTHING;

-- Insert the "captains selected" template
INSERT INTO email_templates (name, subject, content, created_at, updated_at)
VALUES (
    'captains selected',
    'BSD Volleyball: Congrats [division] Division Captains',
    jsonb_build_object(
        'root',
        jsonb_build_object(
            'type', 'root',
            'direction', NULL,
            'format', '',
            'indent', 0,
            'version', 1,
            'children', jsonb_build_array(
                jsonb_build_object(
                    'type', 'paragraph',
                    'direction', NULL,
                    'format', '',
                    'indent', 0,
                    'version', 1,
                    'children', jsonb_build_array(
                        jsonb_build_object(
                            'type', 'text',
                            'detail', 0,
                            'format', 0,
                            'mode', 'normal',
                            'style', '',
                            'text', 'First of all, a sincere thank you to everyone who volunteered to be a captain in ABA division this season.  I will try to provide as much info as possible to get started, and please feel free to contact me or Josh with questions.  

1) ABA Division Captains 
Margarita Gomez
Austin Jimenez
Anderson Yao
Ken Yuen
Gustavo Rojas Matutue
Kamal Rajogopal

2) It looks like a 6/2 split with gender. At this time, our registration numbers indicate a max of 6 males drafted per team for ABA division. If anything changes we will let you know, but don''t count on it!

3) Preseason Week 1 is this Thursday, August 14th.  The primary focus will be new players, with some limited slots available for returning players to round out the rosters:
There will be two 90-minute sessions, starting at 7:00 pm and 8:30 pm.  Captains MUST attend both sessions.  Attendance will be limited to 96 registered players (48 players for each session - 8 teams of 6 players each across 4 courts).  Each session will contain players at all skill levels.  Before each session, players will be ranked and grouped according to perceived skill level across 4 courts (Court 1 with the highest skilled players thru Court 4 with the lowest skilled players).  The time will be divided equally between drills and game play with an opportunity for “player movement” halfway through each session based on Captain feedback. You should be focusing your attention primarily on courts 2 and 3.

Preseason rosters are posted on the website. Captains will not play in Preseason Week 1.  We will schedule games for all players, including Captains, in Preseason Weeks 2 and 3! 

4) List of Players: The 6 of you will have access to a spreadsheet containing all players registered for this season. You can find that here: https://docs.google.com/spreadsheets/d/1EMwVfRG2W7cPQjemoeKaEHUzqh9coDJlijBoepYwcog/edit?usp=sharing

Please pay special attention to the "Updates" tab on the spreadsheet, as the board will update it regularly with player injuries, dropouts, etc. This is for your use as a Captain only.  It should not be shared with anyone else. HIGHLY CLASSIFIED!

5) Draft Day is Thursday, September 4th: We are planning to go to a local bar/restaurant, as we always do, to conduct the draft. We plan to host the draft at Dogfish Head or a similar establishment in Gaithersburg at 7:30 PM. If that time frame/location doesn''t work for any of you, then please let us know. If, for whatever reason, you cannot physically attend the draft, we can arrange a Zoom call or phone call during the draft to record your picks. 

Thanks again for volunteering.  Please reply to this email and confirm your attendance.

See you Thursday night!  ',
                            'version', 1
                        )
                    )
                )
            )
        )
    ),
    NOW(),
    NOW()
)
ON CONFLICT (name) DO NOTHING;
