-- Fix RLS policies for secure data access

-- 1. Fix profiles table - only allow users to see their own profile
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- 2. Restrict funding_records write operations to admin users only
DROP POLICY IF EXISTS "Anyone can insert funding records" ON funding_records;
DROP POLICY IF EXISTS "Anyone can delete funding records" ON funding_records;

CREATE POLICY "Only admins can insert funding records"
  ON funding_records FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can update funding records"
  ON funding_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete funding records"
  ON funding_records FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Restrict organizations write operations to admin and rep users
DROP POLICY IF EXISTS "Anyone can insert organizations" ON organizations;
DROP POLICY IF EXISTS "Anyone can delete organizations" ON organizations;

CREATE POLICY "Only admins and reps can insert organizations"
  ON organizations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'rep')
    )
  );

CREATE POLICY "Only admins and reps can update organizations"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'rep')
    )
  );

CREATE POLICY "Only admins and reps can delete organizations"
  ON organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'rep')
    )
  );

-- 4. Restrict subawards write operations to admin users
DROP POLICY IF EXISTS "Anyone can insert subawards" ON subawards;
DROP POLICY IF EXISTS "Anyone can delete subawards" ON subawards;

CREATE POLICY "Only admins can insert subawards"
  ON subawards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can update subawards"
  ON subawards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete subawards"
  ON subawards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Restrict grant_types write operations to admin users
DROP POLICY IF EXISTS "Anyone can insert grant types" ON grant_types;
DROP POLICY IF EXISTS "Anyone can delete grant types" ON grant_types;

CREATE POLICY "Only admins can insert grant types"
  ON grant_types FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can update grant types"
  ON grant_types FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete grant types"
  ON grant_types FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 6. Restrict fetch_progress read access to admin users
DROP POLICY IF EXISTS "Anyone can view fetch progress" ON fetch_progress;

CREATE POLICY "Only admins can view fetch progress"
  ON fetch_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );