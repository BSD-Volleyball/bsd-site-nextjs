-- Insert the "welcome from captains" email template
INSERT INTO email_templates (name, subject, content, created_at, updated_at)
VALUES (
    'welcome from captains',
    'BSD Volleyball: Welcome to [team_name] in division [division_name]',
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
                            'text', 'Hi Team,',
                            'version', 1
                        )
                    )
                ),
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
                            'text', 'Welcome to ',
                            'version', 1
                        ),
                        jsonb_build_object(
                            'type', 'template-variable',
                            'variableKey', 'team_name',
                            'version', 1
                        ),
                        jsonb_build_object(
                            'type', 'text',
                            'detail', 0,
                            'format', 0,
                            'mode', 'normal',
                            'style', '',
                            'text', ' in the ',
                            'version', 1
                        ),
                        jsonb_build_object(
                            'type', 'template-variable',
                            'variableKey', 'division_name',
                            'version', 1
                        ),
                        jsonb_build_object(
                            'type', 'text',
                            'detail', 0,
                            'format', 0,
                            'mode', 'normal',
                            'style', '',
                            'text', ' division for ',
                            'version', 1
                        ),
                        jsonb_build_object(
                            'type', 'template-variable',
                            'variableKey', 'season_name',
                            'version', 1
                        ),
                        jsonb_build_object(
                            'type', 'text',
                            'detail', 0,
                            'format', 0,
                            'mode', 'normal',
                            'style', '',
                            'text', '!',
                            'version', 1
                        )
                    )
                ),
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
                            'text', 'I''m excited to be your captain this season. Here''s your full roster:',
                            'version', 1
                        )
                    )
                ),
                jsonb_build_object(
                    'type', 'paragraph',
                    'direction', NULL,
                    'format', '',
                    'indent', 0,
                    'version', 1,
                    'children', jsonb_build_array(
                        jsonb_build_object(
                            'type', 'template-variable',
                            'variableKey', 'team_members',
                            'version', 1
                        )
                    )
                ),
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
                            'text', 'I''ll be reaching out soon with more details about our schedule and practice plans. Looking forward to a great season together!',
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
