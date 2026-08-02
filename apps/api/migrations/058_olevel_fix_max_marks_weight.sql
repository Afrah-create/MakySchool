-- Fix sessions whose max_marks was incorrectly set from category weight %
-- (CA 20 / Exam 80). Weight is for result weighting; paper total is usually 100.
UPDATE olevel_exam_sessions es
SET max_marks = 100,
    updated_at = NOW()
FROM curriculum_assessment_categories c
WHERE c.id = es.category_id
  AND es.max_marks = c.weight_percent
  AND es.max_marks > 0
  AND es.max_marks < 100;
