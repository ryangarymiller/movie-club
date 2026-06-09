-- Publish the discussion tables for Realtime so reviews/comments/reactions/votes
-- propagate live (the open CommentThread + Home "Recent Activity" update with no
-- refresh). Realtime still enforces each table's RLS per-subscriber, so a member
-- never receives an event for a row they can't SELECT (e.g. a review on a film they
-- haven't scored yet). Previously only notifications/ratings/seasons were published,
-- which is why a new review needed a manual refresh to appear.
alter publication supabase_realtime add table public.reviews;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.votes;
