-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "durationHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "expiresAt" TIMESTAMP(3);
