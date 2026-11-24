-- Fix the spelling of the DonationStatus values. RENAME VALUE keeps existing rows.
ALTER TYPE "DonationStatus" RENAME VALUE 'PLEDGE' TO 'PLEDGED';
ALTER TYPE "DonationStatus" RENAME VALUE 'RECIEVED' TO 'RECEIVED';
ALTER TABLE "donations" ALTER COLUMN "status" SET DEFAULT 'RECEIVED';
