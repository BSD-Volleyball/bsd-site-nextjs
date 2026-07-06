-- Insert the "predraft to captains" email template
INSERT INTO email_templates (name, subject, content, created_at, updated_at)
VALUES (
    'predraft to captains',
    'BSD Volleyball: Captain Draft Rounds and Pair Picks',
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
                            'text', 'Hi Captains,',
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
                            'text', 'Here are your draft round assignments and pair pick differentials for the ',
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
                            'text', ' division, ',
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
                            'text', ':',
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
                            'format', 1,
                            'mode', 'normal',
                            'style', '',
                            'text', 'Captain Draft Rounds:',
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
                            'variableKey', 'captain_rounds',
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
                            'format', 1,
                            'mode', 'normal',
                            'style', '',
                            'text', 'Pair Pick Differentials:',
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
                            'variableKey', 'pair_diffs',
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
                            'text', 'Please review and reach out if you have any questions. Good luck at the draft!',
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
