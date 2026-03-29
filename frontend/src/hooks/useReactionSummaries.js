import { useEffect, useState } from "react";
import { getReactionBatchSummary, setReaction } from "../services/api";
import {
  REALTIME_EVENTS,
  subscribeReactionTargets,
  unsubscribeReactionTargets,
} from "../services/realtime";
import { toast, toastFromError } from "../services/toast";
import {
  createEmptyReactionSummary,
  makeReactionTargetKey,
} from "../utils/reactions";

function normalizeTargets(targets) {
  return Array.isArray(targets)
    ? targets.filter((target) => target?.targetType && target?.targetId)
    : [];
}

export default function useReactionSummaries({ targets = [], user }) {
  const normalizedTargets = normalizeTargets(targets);
  const targetsKey = normalizedTargets
    .map((target) => makeReactionTargetKey(target.targetType, target.targetId))
    .join("|");
  const [summaryMap, setSummaryMap] = useState({});
  const [loadingKeys, setLoadingKeys] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadSummaries = async () => {
      if (!normalizedTargets.length) {
        setSummaryMap({});
        return;
      }

      try {
        const response = await getReactionBatchSummary(normalizedTargets);
        if (cancelled) {
          return;
        }

        const nextMap = {};
        normalizedTargets.forEach((target) => {
          const key = makeReactionTargetKey(target.targetType, target.targetId);
          nextMap[key] = createEmptyReactionSummary(target.targetType, target.targetId);
        });

        (response.data || []).forEach((summary) => {
          const key = makeReactionTargetKey(summary.targetType, summary.targetId);
          nextMap[key] = summary;
        });

        setSummaryMap(nextMap);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    };

    loadSummaries();

    return () => {
      cancelled = true;
    };
  }, [targetsKey, user?.id]);

  useEffect(() => {
    if (!normalizedTargets.length) {
      return undefined;
    }

    const accessToken = user?.accessToken || user?.token || null;
    const socket = subscribeReactionTargets(normalizedTargets, accessToken);
    if (!socket) {
      return undefined;
    }

    const handleReactionUpdated = (payload) => {
      const targetType = String(payload?.targetType || "").trim().toUpperCase();
      const targetId = String(payload?.targetId || "").trim();
      if (!targetType || !targetId) {
        return;
      }

      const key = makeReactionTargetKey(targetType, targetId);
      const incomingSummary = payload?.summary || createEmptyReactionSummary(targetType, targetId);

      setSummaryMap((prev) => {
        const previousSummary =
          prev[key] || createEmptyReactionSummary(targetType, targetId);
        const nextSummary = {
          ...incomingSummary,
          userEmotion: previousSummary.userEmotion || null,
        };

        if (user?.id && String(payload?.actorUserId || "") === String(user.id)) {
          nextSummary.userEmotion = payload?.actorEmotion || null;
        }

        return {
          ...prev,
          [key]: nextSummary,
        };
      });
    };

    socket.on(REALTIME_EVENTS.reactionUpdated, handleReactionUpdated);

    return () => {
      socket.off(REALTIME_EVENTS.reactionUpdated, handleReactionUpdated);
      unsubscribeReactionTargets(normalizedTargets);
    };
  }, [targetsKey, user?.id, user?.accessToken, user?.token]);

  const getSummary = (target) => {
    if (!target?.targetType || !target?.targetId) {
      return createEmptyReactionSummary("", "");
    }

    const key = makeReactionTargetKey(target.targetType, target.targetId);
    return summaryMap[key] || createEmptyReactionSummary(target.targetType, target.targetId);
  };

  const loadingTarget = (target) => {
    if (!target?.targetType || !target?.targetId) {
      return false;
    }

    return loadingKeys.includes(makeReactionTargetKey(target.targetType, target.targetId));
  };

  const reactToTarget = async (target, emotion) => {
    if (!target?.targetType || !target?.targetId) {
      return { skipped: true };
    }

    if (!user) {
      toast.warning("Vui long dang nhap de tha cam xuc.");
      return { requiresAuth: true };
    }

    const key = makeReactionTargetKey(target.targetType, target.targetId);
    setLoadingKeys((prev) => [...prev, key]);

    try {
      const response = await setReaction({
        ...target,
        emotion,
      });
      const summary = response.data?.summary || createEmptyReactionSummary(
        target.targetType,
        target.targetId,
      );
      setSummaryMap((prev) => ({
        ...prev,
        [key]: summary,
      }));
      return { summary };
    } catch (error) {
      toastFromError(error, "Khong cap nhat duoc cam xuc.");
      return { error };
    } finally {
      setLoadingKeys((prev) => prev.filter((item) => item !== key));
    }
  };

  return {
    getSummary,
    loadingTarget,
    reactToTarget,
  };
}
