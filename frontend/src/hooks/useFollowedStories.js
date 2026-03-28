import { useEffect, useState } from 'react';
import { followStory, getFollowedStories } from '../services/api';
import { toast, toastFromError } from '../services/toast';

export default function useFollowedStories(user) {
  const [followedStoryIds, setFollowedStoryIds] = useState([]);
  const [processingIds, setProcessingIds] = useState([]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setFollowedStoryIds([]);
      setProcessingIds([]);
      return undefined;
    }

    getFollowedStories()
      .then((response) => {
        if (cancelled) {
          return;
        }

        const nextIds = (response.data || [])
          .map((story) => story?.id || story?._id)
          .filter(Boolean);

        setFollowedStoryIds(nextIds);
      })
      .catch(() => {
        if (!cancelled) {
          setFollowedStoryIds([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isFollowingStory = (storyId) => followedStoryIds.includes(storyId);
  const isProcessing = (storyId) => processingIds.includes(storyId);

  const toggleFollow = async (storyId) => {
    if (!user) {
      return { requiresAuth: true, isFollowing: false };
    }

    if (!storyId || isProcessing(storyId)) {
      return {
        requiresAuth: false,
        isFollowing: isFollowingStory(storyId),
      };
    }

    setProcessingIds((prev) => [...prev, storyId]);

    try {
      const response = await followStory(storyId);
      const nextIsFollowing = Boolean(response.data?.isFollowing);

      setFollowedStoryIds((prev) =>
        nextIsFollowing
          ? Array.from(new Set([...prev, storyId]))
          : prev.filter((id) => id !== storyId),
      );

      toast.success(
        nextIsFollowing ? 'Đã theo dõi truyện.' : 'Đã bỏ theo dõi truyện.',
      );

      return {
        requiresAuth: false,
        isFollowing: nextIsFollowing,
      };
    } catch (error) {
      toastFromError(error, 'Không cập nhật được trạng thái theo dõi.');
      throw error;
    } finally {
      setProcessingIds((prev) => prev.filter((id) => id !== storyId));
    }
  };

  return {
    isFollowingStory,
    isProcessing,
    toggleFollow,
  };
}
