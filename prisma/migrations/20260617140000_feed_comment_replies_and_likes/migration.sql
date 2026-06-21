-- Comment replies (one level), comment likes, and admin "as studio" comments.

ALTER TABLE "Comment" ADD COLUMN "asStudio" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- Self-relation FK for replies (parentId -> Comment.id). Existing rows have
-- parentId NULL (the UI never set it), so this is safe to add.
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Comment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommentLike" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentLike_userId_commentId_key" ON "CommentLike"("userId", "commentId");
CREATE INDEX "CommentLike_commentId_idx" ON "CommentLike"("commentId");

ALTER TABLE "CommentLike"
  ADD CONSTRAINT "CommentLike_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommentLike"
  ADD CONSTRAINT "CommentLike_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
