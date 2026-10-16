-- Global label convention: data tiers lead with the allowance ("1 GB · 1
-- Day", "5 GB" — the ₦200 tier stays silent on duration), unlimited tiers
-- say so ("1 Day Unlimited", "1 Week Unlimited", "1 Month Unlimited"). The
-- retired duo rows keep their historical names for sold vouchers.
UPDATE "wifi_plan" SET "name" = '1 GB · 1 Day', "updated_at" = now() WHERE "id" = 'pos-1';
UPDATE "wifi_plan" SET "name" = '5 GB', "updated_at" = now() WHERE "id" = 'week-5gb';
UPDATE "wifi_plan" SET "name" = '1 Day Unlimited', "updated_at" = now() WHERE "id" = 'day-1';
UPDATE "wifi_plan" SET "name" = '1 Week Unlimited', "updated_at" = now() WHERE "id" = 'week-1';
UPDATE "wifi_plan" SET "name" = '1 Month Unlimited', "updated_at" = now() WHERE "id" = 'month-1';
