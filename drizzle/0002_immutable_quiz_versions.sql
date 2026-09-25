-- Drafts permit incomplete content; a published snapshot must be answerable.
CREATE TRIGGER quiz_versions_validate_insert
BEFORE INSERT ON quiz_versions
BEGIN
  SELECT CASE WHEN NOT json_valid(NEW.questions_json)
    THEN RAISE(ABORT, 'Invalid published quiz JSON') END;
  SELECT CASE WHEN json_type(NEW.questions_json) != 'array'
    OR json_array_length(NEW.questions_json) NOT BETWEEN 1 AND 500
    THEN RAISE(ABORT, 'Published quizzes need 1 to 500 questions') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.questions_json) q WHERE
      q.type != 'object'
      OR json_type(q.value, '$.id') IS NOT 'text'
      OR length(trim(json_extract(q.value, '$.id'))) = 0
      OR json_type(q.value, '$.prompt') IS NOT 'text'
      OR length(trim(json_extract(q.value, '$.prompt'))) NOT BETWEEN 1 AND 4000
      OR json_type(q.value, '$.choices') IS NOT 'array'
      OR json_array_length(q.value, '$.choices') NOT BETWEEN 2 AND 6
      OR json_type(q.value, '$.correctIndex') IS NOT 'integer'
      OR json_extract(q.value, '$.correctIndex') < 0
      OR json_extract(q.value, '$.correctIndex') >= json_array_length(q.value, '$.choices')
      OR json_type(q.value, '$.explanation') IS NOT 'text'
      OR length(json_extract(q.value, '$.explanation')) > 4000
  ) THEN RAISE(ABORT, 'Published questions must be complete') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.questions_json) q, json_each(q.value, '$.choices') choice
    WHERE choice.type != 'text' OR length(trim(choice.value)) NOT BETWEEN 1 AND 1000
  ) THEN RAISE(ABORT, 'Published choices must contain text') END;
  SELECT CASE WHEN (
    SELECT count(DISTINCT json_extract(value, '$.id')) FROM json_each(NEW.questions_json)
  ) != json_array_length(NEW.questions_json)
    THEN RAISE(ABORT, 'Published question IDs must be unique') END;
END;
--> statement-breakpoint
-- Editing an author draft must never change a version students already received.
CREATE TRIGGER quiz_versions_no_update
BEFORE UPDATE ON quiz_versions
BEGIN
  SELECT RAISE(ABORT, 'Published quiz versions are immutable');
END;
