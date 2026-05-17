-- Fix for storage policies to allow upsert (SELECT and UPDATE)

-- VIDEOS
CREATE POLICY "lms_video_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lms-course-videos'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- MATERIALS
CREATE POLICY "lms_mat_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lms-course-materials'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- THUMBNAILS
CREATE POLICY "lms_thumb_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lms-thumbnails'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

CREATE POLICY "lms_thumb_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lms-thumbnails'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
  );

-- SUBMISSIONS
CREATE POLICY "lms_asub_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lms-assignment-submissions'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND get_my_role() IN ('student','admin','staff')
  );
