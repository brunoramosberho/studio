-- Eligible-class date window on the credit (UserPackage) and on the promo code
-- (DiscountCode). The code defines the window; redemption stamps the
-- UserPackage; booking enforces it. Keeps shared packages (e.g. Drop-In)
-- unrestricted — only credits obtained with the code are limited.
ALTER TABLE "UserPackage" ADD COLUMN "eligibleClassesFrom" TIMESTAMP(3);
ALTER TABLE "UserPackage" ADD COLUMN "eligibleClassesUntil" TIMESTAMP(3);

ALTER TABLE "DiscountCode" ADD COLUMN "eligibleClassesFrom" TIMESTAMP(3);
ALTER TABLE "DiscountCode" ADD COLUMN "eligibleClassesUntil" TIMESTAMP(3);
