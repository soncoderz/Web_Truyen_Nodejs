import { Link } from 'react-router-dom';
import RankedAvatar from './RankedAvatar';

export default function CommentIdentity({ comment, compact = false }) {
  const userId = comment?.profileUserId || comment?.userId || '';
  const featuredBadge = Array.isArray(comment?.profileBadges)
    ? [...comment.profileBadges].reverse().find((badge) => badge?.unlocked)
    : null;

  const content = (
    <>
      <RankedAvatar
        user={{ username: comment?.username, avatar: comment?.avatar }}
        skin={comment?.profileSkin}
        size={compact ? 'xs' : 'sm'}
      />
      <span className="comment-identity-text">
        <strong>{comment?.username || 'Ẩn danh'}</strong>
        {comment?.profileSkin?.tier && <small>{comment.profileSkin.tier}</small>}
        {!compact && featuredBadge?.name && (
          <span className="comment-identity-badge">{featuredBadge.name}</span>
        )}
      </span>
    </>
  );

  if (!userId) {
    return <div className={`comment-identity ${compact ? 'compact' : ''}`}>{content}</div>;
  }

  return (
    <Link
      to={`/users/${userId}`}
      className={`comment-identity ${compact ? 'compact' : ''}`}
    >
      {content}
    </Link>
  );
}
