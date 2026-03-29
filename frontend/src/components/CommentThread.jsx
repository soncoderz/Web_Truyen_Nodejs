import { Fragment, useMemo } from 'react';
import CommentIdentity from './CommentIdentity';

function buildCommentTree(comments) {
  const normalizedComments = Array.isArray(comments) ? comments : [];
  const nodeMap = new Map(
    normalizedComments.map((comment) => [
      String(comment?.id || ''),
      {
        comment,
        children: [],
      },
    ]),
  );
  const roots = [];

  normalizedComments.forEach((comment) => {
    const commentId = String(comment?.id || '');
    const parentId = String(comment?.parentCommentId || '').trim();
    const node = nodeMap.get(commentId);
    if (!node) {
      return;
    }

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId).children.push(node);
      return;
    }

    roots.push(node);
  });

  return roots;
}

function renderCommentText(content) {
  const text = String(content || '');
  if (!text) {
    return null;
  }

  const parts = text.split(/(@[^\s@]{1,20})/g);

  return parts.map((part, index) => {
    if (/^@[^\s@]{1,20}$/.test(part)) {
      return (
        <span key={`${part}-${index}`} className="comment-mention">
          {part}
        </span>
      );
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function canDeleteComment(comment, currentUser) {
  if (!comment?.userId || !currentUser?.id) {
    return false;
  }

  if (Array.isArray(currentUser.roles) && currentUser.roles.includes('ROLE_ADMIN')) {
    return true;
  }

  return String(comment.userId) === String(currentUser.id);
}

function CommentNode({
  node,
  currentUser,
  compact = false,
  showChapterBadge = false,
  highlightCommentId = null,
  commentDomIdPrefix = 'comment',
  onReply,
  onDelete,
  level = 0,
}) {
  const comment = node?.comment || null;
  if (!comment) {
    return null;
  }

  const normalizedCommentId = String(comment?.id || '');
  const isTarget = normalizedCommentId && normalizedCommentId === String(highlightCommentId || '');

  return (
    <div
      className={`comment-thread-item ${compact ? 'compact' : ''}`}
      data-level={level}
    >
      <div
        id={`${commentDomIdPrefix}-${normalizedCommentId}`}
        className={`comment-thread-card ${isTarget ? 'is-target' : ''}`}
      >
        <div className="comment-thread-header">
          <div className="comment-thread-meta">
            <CommentIdentity comment={comment} compact={compact} />
            {showChapterBadge && Number.isFinite(Number(comment?.chapterNumber)) && (
              <span className="comment-thread-chip">
                {`Ch.${Number(comment.chapterNumber)}`}
              </span>
            )}
            {comment?.replyToUsername && (
              <span className="comment-thread-chip comment-thread-chip--reply">
                {`Tra loi @${comment.replyToUsername}`}
              </span>
            )}
          </div>
          <span className="comment-thread-date">
            {new Date(comment.createdAt).toLocaleString('vi-VN')}
          </span>
        </div>

        {comment?.content && (
          <p className="comment-thread-content">{renderCommentText(comment.content)}</p>
        )}

        {comment?.gifUrl && (!comment?.gifSize || Number(comment.gifSize) <= 2 * 1024 * 1024) && (
          <img
            className="comment-thread-gif"
            src={comment.gifUrl}
            alt="gif"
            loading="lazy"
            onError={(event) => {
              if (comment.gifUrl && event.target.src !== comment.gifUrl) {
                event.target.src = comment.gifUrl;
              }
            }}
          />
        )}

        {comment?.gifUrl && comment?.gifSize && Number(comment.gifSize) > 2 * 1024 * 1024 && (
          <p className="comment-thread-note">GIF {`>`} 2MB khong hien thi.</p>
        )}

        <div className="comment-thread-actions">
          {typeof onReply === 'function' && (
            <button
              type="button"
              className="comment-thread-action"
              onClick={() => onReply(comment)}
            >
              Tra loi
            </button>
          )}
          {typeof onDelete === 'function' && canDeleteComment(comment, currentUser) && (
            <button
              type="button"
              className="comment-thread-action danger"
              onClick={() => onDelete(comment)}
            >
              Xoa
            </button>
          )}
        </div>
      </div>

      {node.children.length > 0 && (
        <div className="comment-thread-children">
          {node.children.map((childNode) => (
            <CommentNode
              key={childNode.comment.id}
              node={childNode}
              currentUser={currentUser}
              compact={compact}
              showChapterBadge={showChapterBadge}
              highlightCommentId={highlightCommentId}
              commentDomIdPrefix={commentDomIdPrefix}
              onReply={onReply}
              onDelete={onDelete}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({
  comments = [],
  currentUser = null,
  compact = false,
  showChapterBadge = false,
  highlightCommentId = null,
  commentDomIdPrefix = 'comment',
  onReply,
  onDelete,
  emptyText = 'Chua co binh luan nao.',
}) {
  const tree = useMemo(() => buildCommentTree(comments), [comments]);

  if (!tree.length) {
    return <p className="comment-thread-empty">{emptyText}</p>;
  }

  return (
    <div className={`comment-thread-list ${compact ? 'compact' : ''}`}>
      {tree.map((node) => (
        <CommentNode
          key={node.comment.id}
          node={node}
          currentUser={currentUser}
          compact={compact}
          showChapterBadge={showChapterBadge}
          highlightCommentId={highlightCommentId}
          commentDomIdPrefix={commentDomIdPrefix}
          onReply={onReply}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
