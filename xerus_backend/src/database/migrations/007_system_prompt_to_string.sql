-- Migration: 007_system_prompt_to_string.sql
-- Description: Convert system_prompt from JSONB object to markdown string
-- Reason: Industry standard (OpenAI, Anthropic, Google) uses plain strings
--         6-section format is now a CONVENTION, not enforced SCHEMA
-- Depends: 004_agents.sql

-- Step 1: Create function to convert legacy JSONB to markdown string
CREATE OR REPLACE FUNCTION convert_system_prompt_to_markdown(sp JSONB)
RETURNS TEXT AS $$
DECLARE
    result TEXT := '';
    item TEXT;
    idx INT;
BEGIN
    -- If already a string, return as-is
    IF jsonb_typeof(sp) = 'string' THEN
        RETURN sp #>> '{}';
    END IF;

    -- If null or empty, return empty string
    IF sp IS NULL OR sp = '{}'::jsonb THEN
        RETURN '';
    END IF;

    -- Identity -> Opening line
    IF sp->'identity'->'name' IS NOT NULL OR sp->'identity'->'role' IS NOT NULL THEN
        result := result || 'You are ' ||
            COALESCE(sp->'identity'->>'name', 'an AI assistant') || ', a ' ||
            COALESCE(sp->'identity'->>'role', 'helpful assistant') || '.';
        IF sp->'identity'->'purpose' IS NOT NULL AND sp->'identity'->>'purpose' != '' THEN
            result := result || E'\n' || sp->'identity'->>'purpose';
        END IF;
    END IF;

    -- Goals -> Objective section
    IF sp->'goals'->'primary' IS NOT NULL AND sp->'goals'->>'primary' != '' THEN
        result := result || E'\n\n## Objective\n' || sp->'goals'->>'primary';
        IF jsonb_array_length(COALESCE(sp->'goals'->'success_criteria', '[]'::jsonb)) > 0 THEN
            result := result || E'\n\n**Success Criteria:**';
            FOR item IN SELECT jsonb_array_elements_text(sp->'goals'->'success_criteria')
            LOOP
                result := result || E'\n- ' || item;
            END LOOP;
        END IF;
    END IF;

    -- Guidelines -> Instructions section
    IF jsonb_array_length(COALESCE(sp->'guidelines', '[]'::jsonb)) > 0 THEN
        result := result || E'\n\n## Instructions';
        idx := 1;
        FOR item IN SELECT jsonb_array_elements_text(sp->'guidelines')
        LOOP
            result := result || E'\n' || idx || '. ' || item;
            idx := idx + 1;
        END LOOP;
    END IF;

    -- Constraints section
    IF jsonb_array_length(COALESCE(sp->'constraints', '[]'::jsonb)) > 0 THEN
        result := result || E'\n\n## Constraints';
        FOR item IN SELECT jsonb_array_elements_text(sp->'constraints')
        LOOP
            result := result || E'\n- ' || item;
        END LOOP;
    END IF;

    -- Capabilities -> Skills and Tools
    IF jsonb_array_length(COALESCE(sp->'capabilities'->'skills', '[]'::jsonb)) > 0 OR
       jsonb_array_length(COALESCE(sp->'capabilities'->'tools', '[]'::jsonb)) > 0 THEN
        result := result || E'\n\n## Capabilities';
        IF jsonb_array_length(COALESCE(sp->'capabilities'->'skills', '[]'::jsonb)) > 0 THEN
            result := result || E'\n**Skills:**';
            FOR item IN SELECT jsonb_array_elements_text(sp->'capabilities'->'skills')
            LOOP
                result := result || E'\n- ' || item;
            END LOOP;
        END IF;
        IF jsonb_array_length(COALESCE(sp->'capabilities'->'tools', '[]'::jsonb)) > 0 THEN
            result := result || E'\n\n**Tools:**';
            FOR item IN SELECT jsonb_array_elements_text(sp->'capabilities'->'tools')
            LOOP
                result := result || E'\n- ' || item;
            END LOOP;
        END IF;
    END IF;

    -- Personality -> Output Format
    IF sp->'personality'->'style' IS NOT NULL OR sp->'personality'->'tone' IS NOT NULL THEN
        result := result || E'\n\n## Output Format\nStyle: ' ||
            COALESCE(sp->'personality'->>'style', 'professional') || ' | Tone: ' ||
            COALESCE(sp->'personality'->>'tone', 'neutral');
    END IF;

    RETURN TRIM(result);
END;
$$ LANGUAGE plpgsql;

-- Step 2: Convert all existing JSONB objects to markdown strings
-- Store as JSON string in JSONB column (valid JSONB)
UPDATE agents
SET system_prompt = to_jsonb(convert_system_prompt_to_markdown(system_prompt))
WHERE jsonb_typeof(system_prompt) = 'object';

-- Step 3: Update default value to empty string
ALTER TABLE agents
ALTER COLUMN system_prompt SET DEFAULT '""'::jsonb;

-- Step 4: Update table comment
COMMENT ON COLUMN agents.system_prompt IS 'Markdown string prompt (not JSONB object). 6-section format recommended but not enforced.';

-- Step 5: Cleanup - drop the migration function
DROP FUNCTION IF EXISTS convert_system_prompt_to_markdown(JSONB);
