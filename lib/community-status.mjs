export function hasReactedToLog(reactions, logId, reactionType) {
  return reactions.some((reaction) => (
    reaction.daily_log_id === logId && reaction.reaction_type === reactionType
  ));
}

export function getChallengeProgress({ posts, goals, opportunitiesSaved, weekStart }) {
  return {
    'share-3-updates': Math.min(3, posts),
    'set-a-goal': goals.some((goal) => (
      goal.createdAt?.slice(0, 10) >= weekStart
      && (goal.progress > 0 || goal.completed)
    )) ? 1 : 0,
    'explore-opportunities': opportunitiesSaved > 0 ? 1 : 0,
  };
}
