-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
    id serial PRIMARY KEY NOT NULL,
    name text NOT NULL,
    subject text,
    content text NOT NULL,
    created_at timestamp NOT NULL,
    updated_at timestamp NOT NULL,
    CONSTRAINT email_templates_name_unique UNIQUE(name)
);

-- Insert the "call for captains" template
INSERT INTO email_templates (name, subject, content, created_at, updated_at)
VALUES (
    'call for captains',
    'Call for Team Captains',
    'Hi Folks,

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
    NOW(),
    NOW()
)
ON CONFLICT (name) DO NOTHING;
