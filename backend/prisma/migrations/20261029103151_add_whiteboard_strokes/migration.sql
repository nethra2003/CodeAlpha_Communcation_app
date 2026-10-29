-- CreateTable
CREATE TABLE "WhiteboardStroke" (
    "id" TEXT NOT NULL,
    "strokeId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "points" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meetingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,

    CONSTRAINT "WhiteboardStroke_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhiteboardStroke_meetingId_createdAt_idx" ON "WhiteboardStroke"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "WhiteboardStroke_senderId_idx" ON "WhiteboardStroke"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "WhiteboardStroke_meetingId_strokeId_key" ON "WhiteboardStroke"("meetingId", "strokeId");

-- AddForeignKey
ALTER TABLE "WhiteboardStroke" ADD CONSTRAINT "WhiteboardStroke_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhiteboardStroke" ADD CONSTRAINT "WhiteboardStroke_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
