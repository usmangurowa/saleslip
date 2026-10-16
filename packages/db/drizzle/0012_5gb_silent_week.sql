-- The ₦200/5 GB tier runs a full week internally (profile 1-Week-5GB, 7-day
-- on-login expiry) but lists no duration buyer-facing: the 5 GB cap sells
-- the plan and "1 week" would undercut the ₦2,000 unlimited week. The old
-- 1-Day-5GB profile stays on the router for vouchers already sold on it.
UPDATE "wifi_plan" SET
  "name" = '5 GB Data',
  "description" = '5 GB of data on one device.',
  "validity_label" = '',
  "ros_profile" = '1-Week-5GB',
  "updated_at" = now()
WHERE "id" = 'day-5gb';
