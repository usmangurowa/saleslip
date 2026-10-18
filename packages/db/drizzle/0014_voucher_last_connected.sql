-- Attendance board: when a code was last seen in an active hotspot session.
-- Written by the /sessions board poll and the server-side connection
-- recorder; a voucher with no last_connected_at and zero bytes_used has
-- never been used by a customer and stays off the board.
ALTER TABLE "wifi_voucher" ADD COLUMN "last_connected_at" timestamp;
