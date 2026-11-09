'use client';
import { supabase } from '@/lib/supabase';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getChallengeProgress, hasReactedToLog } from '@/lib/community-status.mjs';
import { getOpportunityVerificationStatus, isOpportunityExpired } from '@/lib/opportunity-status.mjs';
import { 
  Zap, Compass, Cpu, Trophy, BarChart2, Settings, Send, Search, 
  ThumbsUp, Heart, Flame, Sparkles, RefreshCw, CheckCircle, Circle, 
  Trash2, Plus, ExternalLink, ShieldCheck, AlertCircle, Bookmark, 
  Check, ArrowUpRight, Award, UserCheck, Layers, Filter, Activity,
  Clock, CheckSquare, Terminal, Camera, MapPin, Globe, Flag, X,
  Users, MessageCircle
} from 'lucide-react';

function formatLogDate(value) {
  if (!value) return 'Recently';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isSafeHttpUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function ProfileAvatar({ src, name, className }) {
  const imageUrl = normalizeHttpUrl(src);
  const [failedImageUrl, setFailedImageUrl] = useState('');

  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-slate-700 bg-slate-800 text-xs font-bold text-indigo-300 ${className}`}>
      {imageUrl && failedImageUrl !== imageUrl ? (
        <Image
          src={imageUrl}
          alt={`${name || 'Student'} profile picture`}
          fill
          sizes="80px"
          unoptimized
          className="object-cover"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        <span aria-hidden="true">{name?.[0]?.toUpperCase() || <UserCheck className="h-5 w-5" />}</span>
      )}
    </div>
  );
}

const EMPTY_OPPORTUNITY = {
  title: '',
  organization: '',
  category: 'Tech',
  deadline: '',
  grant_amount: '',
  description: '',
  requirements: '',
  location: '',
  format: 'virtual',
  apply_url: '',
};

const EMPTY_OPPORTUNITY_SOURCE = {
  name: '',
  source_type: 'feed',
  url: '',
  status: 'pending',
  publish_policy: 'admin_review',
};

const COMMUNITY_CHALLENGES = [
  { id: 'share-3-updates', title: 'Show your work', description: 'Share three learning or project updates this week.', target: '3 updates', targetCount: 3, icon: Zap },
  { id: 'set-a-goal', title: 'Set a clear target', description: 'Create a Goal Tracker goal and make progress on it.', target: '1 goal', targetCount: 1, icon: Cpu },
  { id: 'explore-opportunities', title: 'Explore what is next', description: 'Save an opportunity you want to learn more about.', target: '1 opportunity', targetCount: 1, icon: Compass },
];

function getCurrentWeekStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

// --- ENTERPRISE DYNAMIC TOAST & NOTICE COMPONENT ---
function Toast({ message, type, onClose }) {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'} className={`fixed bottom-5 left-4 right-4 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl transition-all sm:left-auto sm:right-5 ${
      isError 
        ? 'bg-slate-900 border-rose-500/50 text-rose-300' 
        : 'bg-slate-900 border-emerald-500/50 text-emerald-300'
    }`}>
      {isError ? <AlertCircle className="w-5 h-5 text-rose-400" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
      <span className="text-xs font-semibold">{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification" className="ml-2 text-xs font-bold text-slate-400 hover:text-slate-100">✕</button>
    </div>
  );
}

// --- SKELETON LOADERS ---
function CardSkeleton() {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800"></div>
          <div className="space-y-1.5">
            <div className="w-28 h-3 bg-slate-800 rounded"></div>
            <div className="w-16 h-2 bg-slate-800 rounded"></div>
          </div>
        </div>
        <div className="w-12 h-5 bg-slate-800 rounded-full"></div>
      </div>
      <div className="w-full h-12 bg-slate-800/50 rounded-xl"></div>
      <div className="w-1/3 h-3 bg-slate-800 rounded"></div>
    </div>
  );
}

export default function OdysseySaaSApp() {
  // Navigation Tabs: 'feed' | 'friends' | 'opportunities' | 'tech' | 'leaderboard' | 'analytics' | 'profile'
  const [activeTab, setActiveTab] = useState('feed');

  // Supabase Data & Auth State
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState({
    full_name: '',
    category: 'Tech',
    bio: '',
    avatar_url: '',
    location: '',
    target_orgs: [],
    github: '',
    linkedin: '',
    portfolio: '',
    website_url: '',
    daily_goal_hours: 4,
    current_streak: 0,
    is_profile_public: true,
    goals_public: false,
    activity_public: true,
    reminder_settings: { enabled: false, daily: false, weekly: false, hour: 18 },
  });

  const [logs, setLogs] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendPeerProfiles, setFriendPeerProfiles] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [friendUnreadCounts, setFriendUnreadCounts] = useState({});
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [directMessages, setDirectMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendLoadError, setFriendLoadError] = useState('');
  const [sendingFriendRequestId, setSendingFriendRequestId] = useState('');
  const [respondingFriendRequestId, setRespondingFriendRequestId] = useState('');
  const [friendActionBusyId, setFriendActionBusyId] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [viewingProfileGoals, setViewingProfileGoals] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunityBookmarks, setOpportunityBookmarks] = useState([]);
  const [communityReports, setCommunityReports] = useState([]);
  const [communityReportLoadError, setCommunityReportLoadError] = useState('');
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [myWallReactions, setMyWallReactions] = useState([]);
  const [pendingWallReactions, setPendingWallReactions] = useState([]);
  const [challengeParticipation, setChallengeParticipation] = useState([]);
  const [weeklyReview, setWeeklyReview] = useState({ focus: '', reflection: '' });
  const [savingWeeklyReview, setSavingWeeklyReview] = useState(false);
  const [bookmarkFilter, setBookmarkFilter] = useState('all');
  const [adminProfiles, setAdminProfiles] = useState([]);
  const [adminLogs, setAdminLogs] = useState([]);
  const [adminStats, setAdminStats] = useState({ users: 0, posts: 0, opportunities: 0 });
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminProfileSearch, setAdminProfileSearch] = useState('');
  const [adminAccountBusy, setAdminAccountBusy] = useState('');
  const [accountManagementError, setAccountManagementError] = useState('');
  const [suspendedAccountIds, setSuspendedAccountIds] = useState([]);
  const [opportunitySources, setOpportunitySources] = useState([]);
  const [opportunitySourceForm, setOpportunitySourceForm] = useState(EMPTY_OPPORTUNITY_SOURCE);
  const [editingOpportunitySourceId, setEditingOpportunitySourceId] = useState(null);
  const [savingOpportunitySource, setSavingOpportunitySource] = useState(false);
  const [testingOpportunitySourceId, setTestingOpportunitySourceId] = useState('');
  const [syncingOpportunitySourceId, setSyncingOpportunitySourceId] = useState('');
  const [opportunitySourceLoadError, setOpportunitySourceLoadError] = useState('');
  const [opportunityStatusFilter, setOpportunityStatusFilter] = useState('pending');
  const [dataErrors, setDataErrors] = useState([]);
  const [opportunityForm, setOpportunityForm] = useState(EMPTY_OPPORTUNITY);
  const [editingOpportunityId, setEditingOpportunityId] = useState(null);
  const [savingOpportunity, setSavingOpportunity] = useState(false);
  const [opportunitySearch, setOpportunitySearch] = useState('');
  const [opportunityLocation, setOpportunityLocation] = useState('All locations');
  const [opportunityCategory, setOpportunityCategory] = useState('all');
  const [opportunityFormat, setOpportunityFormat] = useState('all');
  const [opportunitySort, setOpportunitySort] = useState('deadline');

  // Form Inputs
  const [logInput, setLogInput] = useState('');
  const [logCategory, setLogCategory] = useState('Tech');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [submittingLog, setSubmittingLog] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [onboardingDismissedUserId, setOnboardingDismissedUserId] = useState('');

  // Tech Roadmap Milestone State (User-editable)
  const [customMilestones, setCustomMilestones] = useState([]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneCat, setNewMilestoneCat] = useState('Systems');
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState('');
  const [newMilestonePriority, setNewMilestonePriority] = useState('medium');
  const [newMilestoneNotes, setNewMilestoneNotes] = useState('');
  const [newMilestoneResource, setNewMilestoneResource] = useState('');
  const [newMilestoneChecklist, setNewMilestoneChecklist] = useState('');
  const [savingTechGoals, setSavingTechGoals] = useState(false);
  const [techGoalFilter, setTechGoalFilter] = useState('all');

  // Toast Notification System
  const [toast, setToast] = useState({ message: '', type: 'info' });

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'info' }), 4000);
  }, []);

  // --- INITIAL DATA FETCHING FROM SUPABASE ---
  const fetchInitialData = useCallback(async () => {
    const queryErrors = [];
    let hasAdminRole = false;
    let authenticatedUserId = null;

    try {
      // 1. Get Auth Context safely
      if (supabase && supabase.auth) {
        const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        const currentUser = authData?.user ?? null;
        authenticatedUserId = currentUser?.id || null;
        setUser(currentUser);
        hasAdminRole = currentUser?.app_metadata?.role === 'admin';
        setIsAdmin(hasAdminRole);
        const requestedTab = new URLSearchParams(window.location.search).get('tab');
        setActiveTab(hasAdminRole && requestedTab === 'admin' ? 'admin' : 'feed');

        if (!currentUser) {
          setLogs([]);
          setLeaderboard([]);
          setOpportunities([]);
          setDataErrors([]);
          return;
        }

        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (profileErr && profileErr.code !== 'PGRST116') {
          queryErrors.push(`Profile: ${profileErr.message}`);
        }

        if (profileData) {
          setProfile({
            full_name: profileData.full_name || '',
            category: profileData.category || 'Tech',
            bio: profileData.bio || '',
            avatar_url: profileData.avatar_url || '',
            location: profileData.location || '',
            target_orgs: profileData.target_orgs || [],
            github: profileData.github || '',
            linkedin: profileData.linkedin || '',
            portfolio: profileData.portfolio || '',
            website_url: profileData.website_url || '',
            daily_goal_hours: profileData.daily_goal_hours || 4,
            current_streak: profileData.current_streak ?? 0,
            is_profile_public: profileData.is_profile_public ?? true,
            goals_public: profileData.goals_public ?? false,
            activity_public: profileData.activity_public ?? true,
            reminder_settings: { enabled: false, daily: false, weekly: false, hour: 18 },
          });
        }

        const [
          { data: goalData, error: goalError },
          { data: preferenceData, error: preferenceError },
        ] = await Promise.all([
          supabase.from('user_tech_goals').select('goals').eq('user_id', currentUser.id).maybeSingle(),
          supabase.from('user_private_preferences').select('reminder_settings').eq('user_id', currentUser.id).maybeSingle(),
        ]);
        if (goalError) queryErrors.push(`Goal Tracker: ${goalError.message}`);
        else setCustomMilestones(Array.isArray(goalData?.goals) ? goalData.goals : []);
        if (preferenceError) queryErrors.push(`Private preferences: ${preferenceError.message}`);
        else if (preferenceData?.reminder_settings) {
          setProfile((previous) => ({ ...previous, reminder_settings: preferenceData.reminder_settings }));
        }
      }

      // 2. Fetch Live Wall logs for the signed-in workspace
      const { data: logData, error: logErr } = await supabase
        .from('daily_logs')
        .select('*, profiles(*)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (logErr) queryErrors.push(`Live Wall: ${logErr.message}`);
      setLogs(!logErr && logData ? logData : []);

      // 3. Fetch Leaderboard Rankings
      const { data: leaderData, error: leaderErr } = await supabase
        .from('profiles')
        .select('*')
        .order('current_streak', { ascending: false })
        .limit(25);

      if (leaderErr) queryErrors.push(`Rankings: ${leaderErr.message}`);
      setLeaderboard(!leaderErr && leaderData ? leaderData : []);

      // 4. Fetch Opportunities
      let opportunitiesQuery = supabase
        .from('opportunities')
        .select('*')
        .order('deadline', { ascending: true });
      if (!hasAdminRole) {
        opportunitiesQuery = opportunitiesQuery
          .is('archived_at', null)
          .eq('publishing_status', 'published');
      }
      const { data: oppData, error: oppErr } = await opportunitiesQuery;
      if (oppErr) {
        queryErrors.push(
          oppErr.code === 'PGRST205'
            ? 'Opportunities are unavailable because the public.opportunities table has not been created in Supabase yet.'
            : oppErr.code === '42703' || oppErr.code === 'PGRST204'
              ? 'Apply the opportunity review queue migration to enable published-only opportunity visibility.'
            : `Opportunities: ${oppErr.message}`
        );
      }
      setOpportunities(!oppErr && oppData ? oppData : []);

      const [
        { data: bookmarks, error: bookmarkError },
        { data: joinedChallenges, error: challengeError },
        { data: review, error: reviewError },
        { data: wallReactions, error: wallReactionError },
      ] = await Promise.all([
        supabase.from('opportunity_bookmarks').select('*').eq('user_id', authenticatedUserId || ''),
        supabase.from('challenge_participants').select('id, challenge_key, completed_at').eq('user_id', authenticatedUserId || ''),
        supabase.from('weekly_reviews').select('focus, reflection').eq('user_id', authenticatedUserId || '').eq('week_start', getCurrentWeekStart()).maybeSingle(),
        logData?.length
          ? supabase.from('daily_log_reactions')
            .select('daily_log_id, reaction_type')
            .eq('user_id', authenticatedUserId || '')
            .in('daily_log_id', logData.map((log) => log.id))
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (bookmarkError) queryErrors.push(`Opportunity bookmarks: ${bookmarkError.message}`);
      else setOpportunityBookmarks(bookmarks || []);
      if (challengeError) queryErrors.push(`Community challenges: ${challengeError.message}`);
      else setChallengeParticipation((joinedChallenges || [])
        .filter((item) => item.challenge_key?.startsWith(`${getCurrentWeekStart()}:`)));
      if (wallReactionError) queryErrors.push(`Live Wall reactions: ${wallReactionError.message}`);
      else setMyWallReactions(wallReactions || []);
      if (reviewError) queryErrors.push(`Weekly review: ${reviewError.message}`);
      else if (review) setWeeklyReview({ focus: review.focus || '', reflection: review.reflection || '' });

    } catch (err) {
      queryErrors.push(`Dashboard data: ${err.message || 'An unexpected error occurred.'}`);
    } finally {
      setDataErrors(queryErrors);
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    const reminders = profile.reminder_settings;
    if (!user || !reminders?.enabled || (!reminders.daily && !reminders.weekly)) return undefined;
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return undefined;

    const checkReminder = () => {
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      const isDailyTime = reminders.daily && now.getHours() === Number(reminders.hour || 18);
      const isWeeklyTime = reminders.weekly && now.getDay() === 0 && now.getHours() === Number(reminders.hour || 18);
      if (!isDailyTime && !isWeeklyTime) return;
      const reminderType = isWeeklyTime ? 'weekly' : 'daily';
      const storageKey = `odyssey-reminder-${user.id}-${reminderType}-${todayKey}`;
      if (localStorage.getItem(storageKey)) return;

      new Notification(reminderType === 'weekly' ? 'Your Odyssey weekly review' : 'A moment for your goals', {
        body: reminderType === 'weekly'
          ? 'Take a few minutes to review your progress and set a focus for the week.'
          : 'Check in on a goal or share one small step from today.',
      });
      localStorage.setItem(storageKey, 'sent');
    };

    checkReminder();
    const timer = window.setInterval(checkReminder, 60_000);
    return () => window.clearInterval(timer);
  }, [profile.reminder_settings, user]);

  useEffect(() => {
    if (!viewingProfile || (!viewingProfile.goals_public && viewingProfile.id !== user?.id)) return undefined;
    let cancelled = false;
    const loadSharedGoals = async () => {
      const { data, error } = await supabase
        .from('user_tech_goals')
        .select('goals')
        .eq('user_id', viewingProfile.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        showToast(`Could not load shared goals: ${error.message}`, 'error');
        return;
      }
      setViewingProfileGoals(Array.isArray(data?.goals) ? data.goals : []);
    };
    loadSharedGoals();
    return () => {
      cancelled = true;
    };
  }, [viewingProfile, user, showToast]);

  useEffect(() => {
    const timer = setTimeout(fetchInitialData, 0);
    return () => clearTimeout(timer);
  }, [fetchInitialData]);

  const loadFriendsWorkspace = useCallback(async () => {
    if (!user?.id) return;

    try {
      const [
        { data: requests, error: requestsError },
        { data: blockRows, error: blocksError },
        { data: unreadRows, count: unreadCount, error: unreadError },
      ] = await Promise.all([
        supabase.from('friend_requests')
          .select('id, requester_id, recipient_id, status, created_at, updated_at')
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('user_blocks')
          .select('blocked_user')
          .eq('blocked_by', user.id),
        supabase.from('direct_messages')
          .select('sender_id', { count: 'exact' })
          .eq('recipient_id', user.id)
          .is('read_at', null)
          .limit(1000),
      ]);

      if (requestsError) {
        setFriendLoadError(`Friends could not be loaded: ${requestsError.message}`);
        setFriendsLoading(false);
        return;
      }
      if (blocksError) {
        setFriendLoadError(`Blocked accounts could not be loaded: ${blocksError.message}`);
        setFriendsLoading(false);
        return;
      }
      if (unreadError) {
        setFriendLoadError(`Unread message count could not be loaded: ${unreadError.message}`);
        setFriendsLoading(false);
        return;
      }

      const acceptedRequests = (requests || []).filter((request) => request.status === 'accepted');
      const friendIds = acceptedRequests.map((request) => (
        request.requester_id === user.id ? request.recipient_id : request.requester_id
      ));
      const blockedIds = (blockRows || []).map((block) => block.blocked_user);
      const peerIds = [...new Set([
        ...(requests || []).map((request) => (
          request.requester_id === user.id ? request.recipient_id : request.requester_id
        )),
        ...blockedIds,
      ])];
      let friendProfiles = [];
      if (peerIds.length) {
        const { data: profileRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, category, location, is_profile_public')
          .in('id', peerIds);
        if (profilesError) {
          setFriendLoadError(`Friend profiles could not be loaded: ${profilesError.message}`);
          setFriendsLoading(false);
          return;
        }
        friendProfiles = profileRows || [];
      }

      const activeFriends = friendProfiles.filter((friend) => friendIds.includes(friend.id));
      setFriendRequests(requests || []);
      setFriendPeerProfiles(friendProfiles);
      setFriends(activeFriends);
      setBlockedUserIds(blockedIds);
      setUnreadMessageCount(unreadCount || 0);
      setFriendUnreadCounts((unreadRows || []).reduce((counts, message) => {
        counts[message.sender_id] = (counts[message.sender_id] || 0) + 1;
        return counts;
      }, {}));
      setSelectedFriendId((previous) => (
        activeFriends.some((friend) => friend.id === previous)
          ? previous
          : activeFriends[0]?.id || ''
      ));
      setFriendLoadError('');
      setFriendsLoading(false);
    } catch (error) {
      setFriendLoadError(`Friends could not be loaded: ${error.message || 'An unexpected error occurred.'}`);
      setFriendsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab !== 'friends' || !user?.id) return undefined;
    const initialTimer = window.setTimeout(loadFriendsWorkspace, 0);
    const timer = window.setInterval(loadFriendsWorkspace, 60_000);
    const channel = supabase
      .channel(`friends-workspace:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friend_requests',
      }, () => {
        loadFriendsWorkspace();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'direct_messages',
      }, (payload) => {
        const message = payload.new || payload.old;
        if (message?.sender_id === user.id || message?.recipient_id === user.id) {
          setConversationRefreshKey((previous) => previous + 1);
          loadFriendsWorkspace();
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_blocks',
        filter: `blocked_by=eq.${user.id}`,
      }, () => {
        setConversationRefreshKey((previous) => previous + 1);
        loadFriendsWorkspace();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('fallback');
        else setRealtimeStatus('connecting');
      });
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [activeTab, user?.id, loadFriendsWorkspace]);

  useEffect(() => {
    const query = friendSearch.trim();
    if (activeTab !== 'friends' || !user?.id || query.length < 2) {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, category, location')
          .eq('is_profile_public', true)
          .neq('id', user.id)
          .ilike('full_name', `%${query}%`)
          .order('full_name', { ascending: true })
          .limit(12);
        if (cancelled) return;
        if (error) {
          setFriendLoadError(`Student search failed: ${error.message}`);
          setFriendSearchResults([]);
        } else {
          setFriendSearchResults((data || []).filter((candidate) => !blockedUserIds.includes(candidate.id)));
        }
      } catch (error) {
        if (!cancelled) {
          setFriendLoadError(`Student search failed: ${error.message || 'An unexpected error occurred.'}`);
          setFriendSearchResults([]);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, blockedUserIds, friendSearch, user?.id]);

  useEffect(() => {
    if (activeTab !== 'friends' || !user?.id || !selectedFriendId) {
      return undefined;
    }

    let cancelled = false;
    let fetching = false;
    const loadConversation = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const { data, error } = await supabase
          .from('direct_messages')
          .select('id, sender_id, recipient_id, content, created_at, read_at')
          .or(`and(sender_id.eq.${user.id},recipient_id.eq.${selectedFriendId}),and(sender_id.eq.${selectedFriendId},recipient_id.eq.${user.id})`)
          .order('created_at', { ascending: false })
          .limit(100);
        if (cancelled) return;
        if (error) {
          setFriendLoadError(`Messages could not be loaded: ${error.message}`);
          return;
        }
        setDirectMessages((data || []).reverse());
        const unreadIds = (data || [])
          .filter((message) => message.recipient_id === user.id && !message.read_at)
          .map((message) => message.id);
        if (unreadIds.length) {
          const { error: readError } = await supabase
            .from('direct_messages')
            .update({ read_at: new Date().toISOString() })
            .in('id', unreadIds);
          if (readError && !cancelled) {
            setFriendLoadError(`Messages loaded, but read status could not be updated: ${readError.message}`);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setFriendLoadError(`Messages could not be loaded: ${error.message || 'An unexpected error occurred.'}`);
        }
      } finally {
        fetching = false;
      }
    };

    loadConversation();
    const timer = window.setInterval(loadConversation, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTab, selectedFriendId, user?.id, conversationRefreshKey]);

  useEffect(() => {
    if (!reportTarget || submittingReport) return undefined;
    const dismissReportOnEscape = (event) => {
      if (event.key === 'Escape') setReportTarget(null);
    };
    window.addEventListener('keydown', dismissReportOnEscape);
    return () => window.removeEventListener('keydown', dismissReportOnEscape);
  }, [reportTarget, submittingReport]);

  useEffect(() => {
    if (activeTab !== 'admin' || !isAdmin) return;
    let cancelled = false;

    const fetchAdminWorkspace = async () => {
      setAdminLoading(true);
      const [
        { data: profileRows, error: profilesError, count: userCount },
        { data: logRows, error: logsError, count: postCount },
        { count: opportunityCount, error: opportunitiesError },
        { data: sourceRows, error: sourcesError },
        { data: reportRows, error: reportsError },
      ] = await Promise.all([
        supabase.from('profiles')
          .select('*', { count: 'exact' })
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase.from('daily_logs')
          .select('*, profiles(*)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('opportunities')
          .select('id', { count: 'exact', head: true }),
        supabase.from('opportunity_sources')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('community_reports')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (cancelled) return;
      if (sourcesError) {
        setOpportunitySourceLoadError(
          sourcesError.code === 'PGRST205'
            ? 'Apply the opportunity sources migration to enable this panel.'
            : sourcesError.message
        );
      } else {
        setOpportunitySources(sourceRows || []);
        setOpportunitySourceLoadError('');
      }
      if (reportsError) {
        setCommunityReportLoadError(reportsError.message);
      } else {
        setCommunityReports(reportRows || []);
        setCommunityReportLoadError('');
      }
      const firstError = profilesError || logsError || opportunitiesError;
      if (firstError) {
        showToast(`Admin workspace could not load: ${firstError.message}`, 'error');
      } else {
        setAdminProfiles(profileRows || []);
        setAdminLogs(logRows || []);
        setAdminStats({
          users: userCount || 0,
          posts: postCount || 0,
          opportunities: opportunityCount || 0,
        });
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) throw new Error('Sign in again to view account status.');
          const response = await fetch('/api/admin/accounts', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'list', userIds: (profileRows || []).map((row) => row.id) }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Account status could not be loaded.');
          setSuspendedAccountIds(result.suspendedIds || []);
          setAccountManagementError('');
        } catch (error) {
          setAccountManagementError(error.message || 'Account management is not available.');
        }
      }
      setAdminLoading(false);
    };

    fetchAdminWorkspace();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, showToast]);

  // --- LOG MUTATION (LIVE WALL) ---
  const handlePostLog = async (e) => {
    e.preventDefault();
    if (!logInput.trim()) return;
    if (!user) {
      showToast('Sign in to post a milestone to the Live Wall.', 'error');
      return;
    }

    setSubmittingLog(true);
    try {
      const { data, error } = await supabase.from('daily_logs').insert([
        {
          user_id: user.id,
          content: logInput.trim(),
          category: logCategory
        }
      ]).select('*, profiles(*)');

      if (error) throw error;

      if (data && data.length > 0) {
        setLogs((previous) => [data[0], ...previous]);
      }

      setLogInput('');
      showToast('Milestone successfully broadcasted to live wall!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to post log update.', 'error');
    } finally {
      setSubmittingLog(false);
    }
  };

  // --- REACTION MUTATION ---
  const handleReaction = async (logId, reactionType) => {
    if (!user) {
      showToast('Sign in to react to a Live Wall update.', 'error');
      return;
    }
    const reactionKey = `${logId}:${reactionType}`;
    const reactionTypeKey = reactionType === 'high_fives' ? 'high_five' : 'support';
    if (hasReactedToLog(myWallReactions, logId, reactionTypeKey)
      || pendingWallReactions.includes(reactionKey)) return;

    const targetLog = logs.find((log) => log.id === logId);
    if (!targetLog) return;
    setPendingWallReactions((previous) => [...previous, reactionKey]);

    try {
      const { error } = await supabase.from('daily_log_reactions').insert({
        daily_log_id: logId,
        user_id: user.id,
        reaction_type: reactionTypeKey,
      });
      if (error) {
        if (error.code === '23505') {
          setMyWallReactions((previous) => [...previous, { daily_log_id: logId, reaction_type: reactionTypeKey }]);
          showToast('You have already reacted to this update.', 'info');
          return;
        }
        throw error;
      }
      setMyWallReactions((previous) => [...previous, { daily_log_id: logId, reaction_type: reactionTypeKey }]);
      setLogs((previous) => previous.map((log) => (
        log.id === logId ? { ...log, [reactionType]: (log[reactionType] || 0) + 1 } : log
      )));
    } catch (err) {
      showToast(err.message || 'Could not save your reaction.', 'error');
    } finally {
      setPendingWallReactions((previous) => previous.filter((key) => key !== reactionKey));
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setIsAdmin(false);
      setLogs([]);
      setLeaderboard([]);
      setOpportunities([]);
      setFriendRequests([]);
      setFriends([]);
      setFriendPeerProfiles([]);
      setBlockedUserIds([]);
      setUnreadMessageCount(0);
      setFriendUnreadCounts({});
      setFriendSearchResults([]);
      setDirectMessages([]);
      setSelectedFriendId('');
      setFriendSearch('');
      setFriendLoadError('');
      setFriendsLoading(true);
      setDataErrors([]);
      setCustomMilestones([]);
      setActiveTab('feed');
      showToast('You have signed out.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not sign out. Please try again.', 'error');
    }
  };

  // --- PROFILE UPDATE ---
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      if (!user) {
        showToast('Profile updated for this session. Join to save it across devices.', 'info');
        return;
      }

      const profileLinks = [
        ['Website', profile.website_url],
        ['GitHub', profile.github],
        ['LinkedIn', profile.linkedin],
        ['Portfolio', profile.portfolio],
      ];
      const invalidLink = profileLinks.find(([label, value]) => value && !isSafeHttpUrl(value));
      if (invalidLink) {
        throw new Error(`${invalidLink[0]} link must start with http:// or https://.`);
      }

      const { data: savedProfile, error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: profile.full_name,
        category: profile.category,
        bio: profile.bio.trim(),
        avatar_url: profile.avatar_url || null,
        location: profile.location.trim(),
        target_orgs: profile.target_orgs,
        github: normalizeHttpUrl(profile.github),
        linkedin: normalizeHttpUrl(profile.linkedin),
        portfolio: normalizeHttpUrl(profile.portfolio),
        website_url: normalizeHttpUrl(profile.website_url),
        daily_goal_hours: profile.daily_goal_hours,
        is_profile_public: profile.is_profile_public,
        goals_public: profile.goals_public,
        activity_public: profile.activity_public,
        updated_at: new Date().toISOString()
      }).select('*').single();

      if (error) {
        if (error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205') {
          throw new Error(
            `Supabase could not save your profile (${error.code}: ${error.message}). ` +
            'Apply supabase/migrations/20261109000001_profile_schema_compatibility.sql in the Supabase SQL Editor. ' +
            'If you already applied it, wait a minute and refresh so the Supabase API schema cache can reload.'
          );
        }
        throw error;
      }
      const { error: preferencesError } = await supabase.from('user_private_preferences').upsert({
        user_id: user.id,
        reminder_settings: profile.reminder_settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (preferencesError) {
        if (preferencesError.code === '42P01' || preferencesError.code === 'PGRST205'
          || preferencesError.code === '42703' || preferencesError.code === 'PGRST204') {
          throw new Error(
            `Your profile was saved, but reminder settings could not be saved (${preferencesError.code}: ${preferencesError.message}). ` +
            'Apply supabase/migrations/20261109000001_profile_schema_compatibility.sql in the Supabase SQL Editor.'
          );
        }
        throw preferencesError;
      }
      setProfile((previous) => ({
        ...previous,
        github: normalizeHttpUrl(previous.github),
        linkedin: normalizeHttpUrl(previous.linkedin),
        portfolio: normalizeHttpUrl(previous.portfolio),
        website_url: normalizeHttpUrl(previous.website_url),
      }));
      setLeaderboard((previous) => previous.map((rankedProfile) => (
        rankedProfile.id === user.id
          ? { ...rankedProfile, ...savedProfile }
          : rankedProfile
      )));
      setLogs((previous) => previous.map((log) => (
        log.user_id === user.id
          ? { ...log, profiles: { ...log.profiles, ...savedProfile } }
          : log
      )));
      if (profile.reminder_settings?.enabled && typeof window !== 'undefined' && 'Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          showToast('Profile saved. Allow notifications in your browser to receive reminders.', 'info');
          return;
        }
      }
      showToast('Profile configuration saved successfully.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update profile settings.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!user) {
      showToast('Sign in to add a profile picture.', 'error');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Choose a JPG, PNG, or WebP image.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Profile pictures must be 5 MB or smaller.', 'error');
      return;
    }

    setUploadingAvatar(true);
    try {
      const path = `${user.id}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
      const avatarUrl = new URL(data.publicUrl);
      avatarUrl.searchParams.set('updated', Date.now().toString());
      setProfile((previous) => ({ ...previous, avatar_url: avatarUrl.href }));
      showToast('Profile picture uploaded. Save your profile to publish it.', 'success');
    } catch (err) {
      const errorMessage = typeof err?.message === 'string' ? err.message : '';
      if (errorMessage.toLowerCase().includes('bucket not found')) {
        showToast(
          'The profile-avatars bucket is missing. Apply the profile customization migration in your Supabase SQL Editor, then try again.',
          'error'
        );
      } else {
        showToast(errorMessage || 'Could not upload your profile picture.', 'error');
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const resetOpportunityForm = () => {
    setOpportunityForm(EMPTY_OPPORTUNITY);
    setEditingOpportunityId(null);
  };

  const handleOpportunitySubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Administrator access is required to manage opportunities.', 'error');
      return;
    }

    setSavingOpportunity(true);
    try {
      if (opportunityForm.apply_url && !isSafeHttpUrl(opportunityForm.apply_url)) {
        throw new Error('Application links must use http:// or https://.');
      }

      const payload = {
        ...opportunityForm,
        deadline: opportunityForm.deadline || null,
        apply_url: opportunityForm.apply_url || null,
        updated_at: new Date().toISOString(),
      };

      const request = editingOpportunityId
        ? supabase.from('opportunities').update(payload).eq('id', editingOpportunityId)
        : supabase.from('opportunities').insert(payload);
      const { error } = await request;
      if (error) throw error;

      const { data, error: refreshError } = await supabase
        .from('opportunities')
        .select('*')
        .order('deadline', { ascending: true });
      if (refreshError) throw refreshError;

      setOpportunities(data || []);
      setDataErrors((previous) => previous.filter((message) => !message.startsWith('Opportunities')));
      showToast(editingOpportunityId ? 'Opportunity updated.' : 'Opportunity created.', 'success');
      resetOpportunityForm();
    } catch (err) {
      showToast(err.message || 'Could not save the opportunity.', 'error');
    } finally {
      setSavingOpportunity(false);
    }
  };

  const handleEditOpportunity = (opportunity) => {
    setEditingOpportunityId(opportunity.id);
    setOpportunityForm({
      title: opportunity.title || '',
      organization: opportunity.organization || '',
      category: opportunity.category || 'Tech',
      deadline: opportunity.deadline || '',
      grant_amount: opportunity.grant_amount || '',
      description: opportunity.description || '',
      requirements: opportunity.requirements || '',
      location: opportunity.location || '',
      format: opportunity.format || 'virtual',
      apply_url: opportunity.apply_url || '',
    });
    setActiveTab('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteOpportunity = async (opportunity) => {
    if (!isAdmin) {
      showToast('Administrator access is required to manage opportunities.', 'error');
      return;
    }
    if (!window.confirm(`Delete "${opportunity.title}"? This cannot be undone.`)) return;

    try {
      const { error } = await supabase.from('opportunities').delete().eq('id', opportunity.id);
      if (error) throw error;
      setOpportunities((previous) => previous.filter((item) => item.id !== opportunity.id));
      if (editingOpportunityId === opportunity.id) resetOpportunityForm();
      showToast('Opportunity deleted.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not delete the opportunity.', 'error');
    }
  };

  const updateOpportunityPublishing = async (opportunity, changes) => {
    if (!isAdmin) return;
    const { data, error } = await supabase
      .from('opportunities')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', opportunity.id)
      .select('*')
      .single();

    if (error) {
      showToast(`Could not update opportunity: ${error.message}`, 'error');
      return;
    }

    setOpportunities((previous) => previous.map((item) => item.id === opportunity.id ? data : item));
    if (changes.publishing_status === 'published') {
      showToast('Opportunity approved and published.', 'success');
    } else if (changes.publishing_status === 'rejected') {
      showToast('Feed item rejected and hidden from students.', 'success');
    } else if (changes.last_verified_at) {
      showToast('Opportunity marked verified today.', 'success');
    } else {
      showToast(changes.archived_at === null ? 'Opportunity restored.' : changes.archived_at ? 'Opportunity archived.' : 'Opportunity feature updated.', 'success');
    }
  };

  const resetOpportunitySourceForm = () => {
    setOpportunitySourceForm(EMPTY_OPPORTUNITY_SOURCE);
    setEditingOpportunitySourceId(null);
  };

  const handleOpportunitySourceSubmit = async (event) => {
    event.preventDefault();
    if (!isAdmin) {
      showToast('Administrator access is required to manage opportunity sources.', 'error');
      return;
    }

    const existingSource = opportunitySources.find((source) => source.id === editingOpportunitySourceId);
    const url = opportunitySourceForm.url.trim();
    if (opportunitySourceForm.source_type !== 'manual' && !url) {
      showToast('Add the API, feed, or CSV endpoint URL.', 'error');
      return;
    }
    if (url && (!isSafeHttpUrl(url) || new URL(url).protocol !== 'https:')) {
      showToast('Source URLs must use HTTPS.', 'error');
      return;
    }
    const currentTestMatchesSource = existingSource?.last_test_result === 'passed'
      && existingSource.source_type === opportunitySourceForm.source_type
      && existingSource.url === (url || null);
    if (opportunitySourceForm.publish_policy === 'auto') {
      showToast('Automatic publishing is not available yet. Choose admin review before saving this source.', 'error');
      return;
    }

    setSavingOpportunitySource(true);
    try {
      const payload = {
        ...opportunitySourceForm,
        name: opportunitySourceForm.name.trim(),
        url: url || null,
        ...(!currentTestMatchesSource ? {
          last_tested_at: null,
          last_test_result: null,
          last_test_message: null,
        } : {}),
        updated_at: new Date().toISOString(),
      };
      const query = editingOpportunitySourceId
        ? supabase.from('opportunity_sources').update(payload).eq('id', editingOpportunitySourceId)
        : supabase.from('opportunity_sources').insert(payload);
      const { data, error } = await query.select('*').single();
      if (error) throw error;

      setOpportunitySources((previous) => editingOpportunitySourceId
        ? previous.map((source) => source.id === data.id ? data : source)
        : [data, ...previous]);
      showToast(editingOpportunitySourceId ? 'Opportunity source updated.' : 'Opportunity source added.', 'success');
      resetOpportunitySourceForm();
    } catch (error) {
      showToast(error.message || 'Could not save the opportunity source.', 'error');
    } finally {
      setSavingOpportunitySource(false);
    }
  };

  const handleEditOpportunitySource = (source) => {
    setEditingOpportunitySourceId(source.id);
    setOpportunitySourceForm({
      name: source.name || '',
      source_type: source.source_type || 'feed',
      url: source.url || '',
      status: source.status || 'pending',
      publish_policy: 'admin_review',
    });
  };

  const handleDeleteOpportunitySource = async (source) => {
    if (!isAdmin || !window.confirm(`Remove "${source.name}" from the source registry?`)) return;
    const { error } = await supabase.from('opportunity_sources').delete().eq('id', source.id);
    if (error) {
      showToast(`Could not remove source: ${error.message}`, 'error');
      return;
    }
    setOpportunitySources((previous) => previous.filter((item) => item.id !== source.id));
    if (editingOpportunitySourceId === source.id) resetOpportunitySourceForm();
    showToast('Opportunity source removed.', 'success');
  };

  const handleTestOpportunitySource = async (source) => {
    if (!isAdmin || source.source_type === 'manual' || !source.url) return;
    setTestingOpportunitySourceId(source.id);

    let passed = false;
    let message = '';
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sign in again to test opportunity sources.');

      const response = await fetch('/api/admin/opportunity-sources/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceType: source.source_type, url: source.url }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The source test failed.');
      passed = true;
      message = result.message;
    } catch (error) {
      message = error.message || 'The source test failed.';
    }

    try {
      const { data, error } = await supabase
        .from('opportunity_sources')
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_result: passed ? 'passed' : 'failed',
          last_test_message: message,
          ...(!passed && source.publish_policy === 'auto' ? { publish_policy: 'admin_review' } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', source.id)
        .select('*')
        .single();

      if (error) {
        showToast(`Source test ${passed ? 'passed' : 'failed'}, but its result could not be saved: ${error.message}`, 'error');
      } else {
        setOpportunitySources((previous) => previous.map((item) => item.id === source.id ? data : item));
        showToast(
          passed
            ? 'Source connection test passed.'
            : `Source test failed: ${message}${source.publish_policy === 'auto' ? ' Auto publishing was returned to admin review.' : ''}`,
          passed ? 'success' : 'error'
        );
      }
    } catch (error) {
      showToast(`Source test result could not be saved: ${error.message || 'An unexpected error occurred.'}`, 'error');
    } finally {
      setTestingOpportunitySourceId('');
    }
  };

  const handleSyncOpportunitySource = async (source) => {
    if (!isAdmin || source.source_type !== 'feed') return;
    setSyncingOpportunitySourceId(source.id);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sign in again to sync opportunity sources.');

      const response = await fetch('/api/admin/opportunity-sources/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Feed sync failed.');

      const [
        { data: refreshedOpportunities, error: opportunitiesError },
        { data: refreshedSources, error: sourcesError },
      ] = await Promise.all([
        supabase.from('opportunities').select('*').order('deadline', { ascending: true }),
        supabase.from('opportunity_sources').select('*').order('created_at', { ascending: false }),
      ]);
      if (opportunitiesError) throw opportunitiesError;
      if (sourcesError) throw sourcesError;

      setOpportunities(refreshedOpportunities || []);
      setOpportunitySources(refreshedSources || []);
      setAdminStats((previous) => ({ ...previous, opportunities: refreshedOpportunities?.length || 0 }));
      showToast(result.message, 'success');
    } catch (error) {
      showToast(error.message || 'Could not sync the opportunity feed.', 'error');
    } finally {
      setSyncingOpportunitySourceId('');
    }
  };

  const handleDeleteLog = async (log) => {
    if (!isAdmin || !window.confirm('Remove this Live Wall post? This cannot be undone.')) return;

    const { error } = await supabase.from('daily_logs').delete().eq('id', log.id);
    if (error) {
      showToast(`Could not remove post: ${error.message}`, 'error');
      return;
    }

    setAdminLogs((previous) => previous.filter((item) => item.id !== log.id));
    setLogs((previous) => previous.filter((item) => item.id !== log.id));
    setAdminStats((previous) => ({ ...previous, posts: Math.max(0, previous.posts - 1) }));
    showToast('Live Wall post removed.', 'success');
  };

  const handleAccountStatus = async (account) => {
    if (!isAdmin || account.id === user?.id) return;
    const action = suspendedAccountIds.includes(account.id) ? 'restore' : 'suspend';
    const actionLabel = action === 'suspend' ? 'suspend' : 'restore';
    if (!window.confirm(`${actionLabel[0].toUpperCase()}${actionLabel.slice(1)} ${account.full_name || 'this account'}?`)) return;

    setAdminAccountBusy(account.id);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sign in again to manage accounts.');

      const response = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, userId: account.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Account update failed.');

      setSuspendedAccountIds((previous) => action === 'suspend'
        ? [...new Set([...previous, account.id])]
        : previous.filter((id) => id !== account.id));
      showToast(action === 'suspend' ? 'Account suspended.' : 'Account restored.', 'success');
    } catch (error) {
      showToast(error.message || 'Could not update account status.', 'error');
    } finally {
      setAdminAccountBusy('');
    }
  };

  // --- TECH LAB GOAL TRACKER ---
  const persistTechGoals = async (nextGoals) => {
    if (!user) {
      showToast('Sign in to save Goal Tracker goals.', 'error');
      return false;
    }

    setSavingTechGoals(true);
    try {
      const { error } = await supabase
        .from('user_tech_goals')
        .upsert({ user_id: user.id, goals: nextGoals, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          throw new Error('Goal Tracker storage is not set up yet. Apply supabase/migrations/20261025000001_momentum_features.sql in Supabase.');
        }
        throw error;
      }
      setCustomMilestones(nextGoals);
      return true;
    } catch (error) {
      showToast(error.message || 'Could not save Goal Tracker goals.', 'error');
      return false;
    } finally {
      setSavingTechGoals(false);
    }
  };

  const addCustomMilestone = async (e) => {
    e.preventDefault();
    if (!newMilestoneTitle.trim()) return;
    if (newMilestoneResource && !isSafeHttpUrl(newMilestoneResource)) {
      showToast('Learning resource links must start with http:// or https://.', 'error');
      return;
    }
    const newItem = {
      id: crypto.randomUUID(),
      title: newMilestoneTitle.trim(),
      category: newMilestoneCat,
      dueDate: newMilestoneDueDate,
      priority: newMilestonePriority,
      notes: newMilestoneNotes.trim(),
      resourceUrl: normalizeHttpUrl(newMilestoneResource),
      checklist: newMilestoneChecklist.split('\n').map((item) => item.trim()).filter(Boolean)
        .map((text) => ({ id: crypto.randomUUID(), text, completed: false })),
      progress: 0,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    if (await persistTechGoals([...customMilestones, newItem])) {
      setNewMilestoneTitle('');
      setNewMilestoneDueDate('');
      setNewMilestonePriority('medium');
      setNewMilestoneNotes('');
      setNewMilestoneResource('');
      setNewMilestoneChecklist('');
      showToast('Goal added to your Goal Tracker.', 'success');
    }
  };

  const updateTechGoal = async (id, changes) => {
    const nextGoals = customMilestones.map((goal) => {
      if (goal.id !== id) return goal;
      const updated = { ...goal, ...changes };
      if (typeof changes.progress === 'number') {
        updated.progress = Math.max(0, Math.min(100, changes.progress));
        updated.completed = updated.progress === 100;
      }
      if (changes.completed === true) updated.progress = 100;
      if (changes.completed === false && goal.completed) updated.progress = Math.min(goal.progress || 0, 99);
      if (updated.completed && !goal.completed) updated.completedAt = new Date().toISOString();
      if (!updated.completed) delete updated.completedAt;
      return updated;
    });
    await persistTechGoals(nextGoals);
  };

  const deleteMilestone = async (id) => {
    await persistTechGoals(customMilestones.filter((goal) => goal.id !== id));
  };

  const toggleGoalChecklistItem = async (goalId, itemId) => {
    const nextGoals = customMilestones.map((goal) => {
      if (goal.id !== goalId) return goal;
      const checklist = (goal.checklist || []).map((item) => (
        item.id === itemId ? { ...item, completed: !item.completed } : item
      ));
      const completedCount = checklist.filter((item) => item.completed).length;
      const progress = checklist.length
        ? Math.round((completedCount / checklist.length) * 100)
        : goal.progress || 0;
      const completed = progress === 100 && checklist.length > 0;
      return {
        ...goal,
        checklist,
        progress,
        completed,
        ...(completed && !goal.completed ? { completedAt: new Date().toISOString() } : {}),
      };
    });
    await persistTechGoals(nextGoals);
  };

  const saveWeeklyReview = async (event) => {
    event.preventDefault();
    if (!user) return;
    setSavingWeeklyReview(true);
    try {
      const { error } = await supabase.from('weekly_reviews').upsert({
        user_id: user.id,
        week_start: getCurrentWeekStart(),
        focus: weeklyReview.focus.trim(),
        reflection: weeklyReview.reflection.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_start' });
      if (error) throw error;
      showToast('Weekly review saved.', 'success');
    } catch (error) {
      showToast(error.message || 'Could not save your weekly review.', 'error');
    } finally {
      setSavingWeeklyReview(false);
    }
  };

  const toggleChallenge = async (challengeId) => {
    if (!user) return;
    const challengeKey = `${getCurrentWeekStart()}:${challengeId}`;
    const participation = challengeParticipation.find((item) => item.challenge_key === challengeKey);
    try {
      if (participation) {
        const { error } = await supabase.from('challenge_participants').delete().eq('id', participation.id);
        if (error) throw error;
        setChallengeParticipation((previous) => previous.filter((item) => item.id !== participation.id));
        showToast('You left the challenge.', 'success');
      } else {
        const { data, error } = await supabase.from('challenge_participants')
          .insert({ user_id: user.id, challenge_key: challengeKey })
          .select('id, challenge_key, completed_at')
          .single();
        if (error) throw error;
        setChallengeParticipation((previous) => [...previous, data]);
        showToast('Challenge joined. Your progress will count toward completion.', 'success');
      }
    } catch (error) {
      showToast(error.message || 'Could not update challenge participation.', 'error');
    }
  };

  const completeChallenge = async (challengeId) => {
    if (!user) return;
    const challengeKey = `${getCurrentWeekStart()}:${challengeId}`;
    const participation = challengeParticipation.find((item) => item.challenge_key === challengeKey);
    const challenge = COMMUNITY_CHALLENGES.find((item) => item.id === challengeId);
    const progress = challengeProgress[challengeId] || 0;
    if (!participation || !challenge || progress < challenge.targetCount) {
      showToast('Finish the challenge steps before marking it complete.', 'error');
      return;
    }
    if (participation.completed_at) return;

    const completedAt = new Date().toISOString();
    const { data, error } = await supabase.from('challenge_participants')
      .update({ completed_at: completedAt })
      .eq('id', participation.id)
      .select('id, challenge_key, completed_at')
      .single();
    if (error) {
      showToast(error.message || 'Could not mark the challenge complete.', 'error');
      return;
    }
    setChallengeParticipation((previous) => previous.map((item) => item.id === data.id ? data : item));
    showToast('Challenge completed. Nice work!', 'success');
  };

  const openReportForm = (targetType, targetId) => {
    setReportTarget({ targetType, targetId });
    setReportReason(targetType === 'daily_log' ? 'other' : targetType === 'member' ? 'message_safety' : 'closed_opportunity');
    setReportDetails('');
  };

  const submitCommunityReport = async (event) => {
    event.preventDefault();
    if (!user || !reportTarget) return;
    setSubmittingReport(true);
    try {
      const { error } = await supabase.from('community_reports').insert({
        reporter_id: user.id,
        target_type: reportTarget.targetType,
        target_id: reportTarget.targetId,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      if (error) {
        if (error.code === '23505') {
          setReportTarget(null);
          showToast('You have already reported this item.', 'info');
          return;
        }
        throw error;
      }
      setReportTarget(null);
      showToast('Report sent to the Odyssey moderation team.', 'success');
    } catch (error) {
      showToast(error.message || 'Could not submit your report.', 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  const markCommunityReportReviewed = async (report) => {
    if (!isAdmin) return;
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase.from('community_reports')
      .update({ status: 'reviewed', reviewed_at: reviewedAt })
      .eq('id', report.id);
    if (error) {
      showToast(error.message || 'Could not update this report.', 'error');
      return;
    }
    setCommunityReports((previous) => previous.filter((item) => item.id !== report.id));
    showToast('Report marked as reviewed.', 'success');
  };

  const sendFriendRequest = async (profileToAdd) => {
    if (!user || sendingFriendRequestId) return;
    if (blockedUserIds.includes(profileToAdd.id)) {
      showToast('Unblock this account before sending a friend request.', 'error');
      return;
    }
    setSendingFriendRequestId(profileToAdd.id);
    try {
      const { data, error } = await supabase.from('friend_requests').insert({
        requester_id: user.id,
        recipient_id: profileToAdd.id,
        status: 'pending',
      }).select('id, requester_id, recipient_id, status, created_at, updated_at').single();
      if (error) {
        if (error.code === '23505') {
          await loadFriendsWorkspace();
          showToast('A friend request or friendship already exists.', 'info');
        } else {
          throw error;
        }
        return;
      }
      setFriendRequests((previous) => [data, ...previous]);
      setFriendPeerProfiles((previous) => [
        profileToAdd,
        ...previous.filter((profile) => profile.id !== profileToAdd.id),
      ]);
      showToast(`Friend request sent to ${profileToAdd.full_name || 'this student'}.`, 'success');
    } catch (error) {
      showToast(error.message || 'Could not send friend request.', 'error');
    } finally {
      setSendingFriendRequestId('');
    }
  };

  const respondToFriendRequest = async (request, status) => {
    if (!user || respondingFriendRequestId) return;
    setRespondingFriendRequestId(request.id);
    try {
      const { data, error } = await supabase.from('friend_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', request.id)
        .select('id, requester_id, recipient_id, status, created_at, updated_at')
        .single();
      if (error) throw error;
      setFriendRequests((previous) => previous.map((item) => item.id === data.id ? data : item));
      if (status === 'accepted') {
        await loadFriendsWorkspace();
        showToast('Friend request accepted.', 'success');
      } else {
        showToast('Friend request declined.', 'success');
      }
    } catch (error) {
      showToast(error.message || 'Could not update friend request.', 'error');
    } finally {
      setRespondingFriendRequestId('');
    }
  };

  const removeFriend = async (friend) => {
    if (!user || !window.confirm(`Remove ${friend.full_name || 'this friend'} from your friends list?`)) return;
    const request = friendRequests.find((item) => (
      item.status === 'accepted'
      && (
        (item.requester_id === user.id && item.recipient_id === friend.id)
        || (item.recipient_id === user.id && item.requester_id === friend.id)
      )
    ));
    if (!request) {
      showToast('Friend connection could not be found. Refresh and try again.', 'error');
      return;
    }
    setFriendActionBusyId(friend.id);
    try {
      const { error } = await supabase.from('friend_requests').delete().eq('id', request.id);
      if (error) throw error;
      setFriendRequests((previous) => previous.filter((item) => item.id !== request.id));
      setFriends((previous) => previous.filter((item) => item.id !== friend.id));
      setDirectMessages([]);
      setSelectedFriendId((previous) => previous === friend.id ? '' : previous);
      setFriendUnreadCounts((previous) => {
        const next = { ...previous };
        delete next[friend.id];
        return next;
      });
      showToast('Friend removed. Messaging is no longer available.', 'success');
    } catch (error) {
      showToast(error.message || 'Could not remove this friend.', 'error');
    } finally {
      setFriendActionBusyId('');
    }
  };

  const blockUser = async (targetUser) => {
    if (!user || !targetUser?.id || !window.confirm(
      `Block ${targetUser.full_name || 'this member'}? This removes the friendship and prevents profile access, requests, and messages between you.`
    )) return;
    setFriendActionBusyId(targetUser.id);
    try {
      const { error } = await supabase.from('user_blocks').insert({
        blocked_by: user.id,
        blocked_user: targetUser.id,
      });
      if (error && error.code !== '23505') throw error;
      setBlockedUserIds((previous) => [...new Set([...previous, targetUser.id])]);
      setFriends((previous) => previous.filter((friend) => friend.id !== targetUser.id));
      setFriendRequests((previous) => previous.filter((request) => (
        request.requester_id !== targetUser.id && request.recipient_id !== targetUser.id
      )));
      setDirectMessages([]);
      setSelectedFriendId((previous) => previous === targetUser.id ? '' : previous);
      await loadFriendsWorkspace();
      showToast(error?.code === '23505' ? 'This member is already blocked.' : 'Member blocked.', 'success');
    } catch (error) {
      showToast(error.message || 'Could not block this member.', 'error');
    } finally {
      setFriendActionBusyId('');
    }
  };

  const unblockUser = async (blockedUserId) => {
    if (!user) return;
    setFriendActionBusyId(blockedUserId);
    try {
      const { error } = await supabase.from('user_blocks')
        .delete()
        .eq('blocked_by', user.id)
        .eq('blocked_user', blockedUserId);
      if (error) throw error;
      setBlockedUserIds((previous) => previous.filter((id) => id !== blockedUserId));
      await loadFriendsWorkspace();
      showToast('Member unblocked. This does not restore a previous friendship.', 'success');
    } catch (error) {
      showToast(error.message || 'Could not unblock this member.', 'error');
    } finally {
      setFriendActionBusyId('');
    }
  };

  const sendDirectMessage = async (event) => {
    event.preventDefault();
    const content = messageInput.trim();
    if (!user || !selectedFriendId || !content || sendingMessage) return;
    setSendingMessage(true);
    try {
      const { data, error } = await supabase.from('direct_messages').insert({
        sender_id: user.id,
        recipient_id: selectedFriendId,
        content,
      }).select('id, sender_id, recipient_id, content, created_at, read_at').single();
      if (error) throw error;
      setDirectMessages((previous) => [...previous, data]);
      setMessageInput('');
    } catch (error) {
      showToast(error.message || 'Could not send message.', 'error');
    } finally {
      setSendingMessage(false);
    }
  };

  const toggleOpportunityBookmark = async (opportunity) => {
    if (!user) return;
    const existing = opportunityBookmarks.find((bookmark) => bookmark.opportunity_id === opportunity.id);
    try {
      if (existing) {
        const { error } = await supabase.from('opportunity_bookmarks').delete().eq('id', existing.id);
        if (error) throw error;
        setOpportunityBookmarks((previous) => previous.filter((bookmark) => bookmark.id !== existing.id));
        showToast('Removed from your saved opportunities.', 'success');
      } else {
        const { data, error } = await supabase.from('opportunity_bookmarks').insert({
          user_id: user.id,
          opportunity_id: opportunity.id,
          status: 'saved',
        }).select('*').single();
        if (error) throw error;
        setOpportunityBookmarks((previous) => [...previous, data]);
        showToast('Opportunity saved.', 'success');
      }
    } catch (error) {
      showToast(error.message || 'Could not update saved opportunities.', 'error');
    }
  };

  const updateBookmark = async (bookmarkId, changes) => {
    const { data, error } = await supabase.from('opportunity_bookmarks')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', bookmarkId)
      .select('*')
      .single();
    if (error) {
      showToast(error.message || 'Could not update your saved opportunity.', 'error');
      return;
    }
    setOpportunityBookmarks((previous) => previous.map((bookmark) => bookmark.id === bookmarkId ? data : bookmark));
  };

  // --- FILTERED LOGS & STATS ---
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (log.user_id !== user?.id && (log.profiles?.is_profile_public === false || log.profiles?.activity_public === false)) return false;
      const contentText = (log.content || '').toLowerCase();
      const authorText = (log.profiles?.full_name || '').toLowerCase();
      const query = searchTerm.toLowerCase();

      const matchesSearch = contentText.includes(query) || authorText.includes(query);
      const matchesCategory = selectedFilter === 'All' || log.category === selectedFilter || log.profiles?.category === selectedFilter;
      return matchesSearch && matchesCategory;
    });
  }, [logs, searchTerm, selectedFilter, user]);

  const roadmapStats = useMemo(() => {
    const total = customMilestones.length;
    const completed = customMilestones.filter(m => m.completed).length;
    const active = total - completed;
    const averageProgress = total === 0
      ? 0
      : Math.round(customMilestones.reduce((sum, goal) => sum + (goal.progress ?? (goal.completed ? 100 : 0)), 0) / total);
    const today = new Date().toISOString().slice(0, 10);
    const overdue = customMilestones.filter((goal) => !goal.completed && goal.dueDate && goal.dueDate < today).length;
    return { total, completed, active, overdue, pct: averageProgress };
  }, [customMilestones]);

  const filteredTechGoals = useMemo(() => customMilestones.filter((goal) => {
    if (techGoalFilter === 'active') return !goal.completed;
    if (techGoalFilter === 'completed') return goal.completed;
    if (techGoalFilter === 'overdue') {
      return !goal.completed && goal.dueDate && goal.dueDate < new Date().toISOString().slice(0, 10);
    }
    return true;
  }).sort((left, right) => {
    if (left.completed !== right.completed) return left.completed ? 1 : -1;
    if (left.dueDate && right.dueDate) return left.dueDate.localeCompare(right.dueDate);
    if (left.dueDate) return -1;
    if (right.dueDate) return 1;
    return (right.createdAt || '').localeCompare(left.createdAt || '');
  }), [customMilestones, techGoalFilter]);

  const activityStats = useMemo(() => {
    const visibleActivity = logs.filter((log) => log.profiles?.is_profile_public !== false && log.profiles?.activity_public !== false);
    const timestamps = visibleActivity
      .map((log) => new Date(log.created_at).getTime())
      .filter(Number.isFinite);
    const latestTimestamp = Math.max(0, ...timestamps);
    const anchorDate = latestTimestamp ? new Date(latestTimestamp) : null;
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = anchorDate ? new Date(anchorDate) : null;
      if (date) {
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
      }

      const count = date
        ? visibleActivity.filter((log) => {
          const createdAt = new Date(log.created_at);
          return !Number.isNaN(createdAt.getTime())
            && createdAt.getFullYear() === date.getFullYear()
            && createdAt.getMonth() === date.getMonth()
            && createdAt.getDate() === date.getDate();
        }).length
        : 0;

      return {
        label: date ? new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date) : `Day ${index + 1}`,
        count,
      };
    });
    const categories = ['Tech', 'Business', 'Creative', 'Science'].map((category) => ({
      category,
      count: visibleActivity.filter((log) => (log.category || log.profiles?.category) === category).length,
    }));

    return {
      days,
      categories,
      totalPosts: visibleActivity.length,
      activeDays: days.filter((day) => day.count > 0).length,
      maxDailyCount: Math.max(1, ...days.map((day) => day.count)),
    };
  }, [logs]);

  const opportunityLocations = useMemo(() => (
    [...new Set(opportunities.map((opportunity) => opportunity.location?.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right))
  ), [opportunities]);

  const filteredOpportunities = useMemo(() => {
    const query = opportunitySearch.trim().toLowerCase();

    return opportunities
      .filter((opportunity) => {
        if (activeTab !== 'admin' && opportunity.archived_at) return false;
        if (activeTab === 'admin' && opportunityStatusFilter !== 'all'
          && opportunity.publishing_status !== opportunityStatusFilter) return false;
        const matchesQuery = !query || [
          opportunity.title,
          opportunity.organization,
          opportunity.description,
          opportunity.location,
        ].some((value) => value?.toLowerCase().includes(query));
        const matchesLocation = opportunityLocation === 'All locations'
          || opportunity.location === opportunityLocation;
        const matchesCategory = opportunityCategory === 'all'
          || opportunity.category === opportunityCategory;
        const matchesFormat = opportunityFormat === 'all'
          || (opportunity.format || 'virtual') === opportunityFormat;

        return matchesQuery && matchesLocation && matchesCategory && matchesFormat;
      })
      .sort((left, right) => {
        if (activeTab !== 'admin' && Boolean(left.featured) !== Boolean(right.featured)) {
          return left.featured ? -1 : 1;
        }
        if (opportunitySort === 'location') {
          return (left.location || '').localeCompare(right.location || '');
        }
        if (opportunitySort === 'title') {
          return (left.title || '').localeCompare(right.title || '');
        }
        return (left.deadline || '9999-12-31').localeCompare(right.deadline || '9999-12-31');
      });
  }, [opportunities, opportunitySearch, opportunityLocation, opportunityCategory, opportunityFormat, opportunitySort, opportunityStatusFilter, activeTab]);

  const filteredAdminProfiles = useMemo(() => {
    const query = adminProfileSearch.trim().toLowerCase();
    if (!query) return adminProfiles;
    return adminProfiles.filter((candidate) =>
      [candidate.full_name, candidate.location, candidate.category, candidate.bio]
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [adminProfiles, adminProfileSearch]);

  const publicLeaderboard = useMemo(() => leaderboard.filter((candidate) => candidate.is_profile_public !== false), [leaderboard]);
  const incomingFriendRequests = friendRequests.filter(
    (request) => request.status === 'pending' && request.recipient_id === user?.id
  );
  const outgoingFriendRequests = friendRequests.filter(
    (request) => request.status === 'pending' && request.requester_id === user?.id
  );
  const bookmarkedOpportunities = useMemo(() => opportunityBookmarks
    .map((bookmark) => ({
      ...bookmark,
      opportunity: opportunities.find((opportunity) => opportunity.id === bookmark.opportunity_id),
    }))
    .filter((bookmark) => bookmark.opportunity)
    .filter((bookmark) => bookmarkFilter === 'all' || bookmark.status === bookmarkFilter), [opportunityBookmarks, opportunities, bookmarkFilter]);

  const weeklyInsights = useMemo(() => {
    const weekStart = getCurrentWeekStart();
    const weekPosts = logs.filter((log) => log.user_id === user?.id && log.created_at >= `${weekStart}T00:00:00`);
    const goalsCompletedThisWeek = customMilestones.filter((goal) => (
      goal.completed && goal.completedAt && goal.completedAt.slice(0, 10) >= weekStart
    )).length;
    const goalsCreatedThisWeek = customMilestones.filter((goal) => goal.createdAt && goal.createdAt.slice(0, 10) >= weekStart).length;
    const activeDays = new Set(weekPosts.map((log) => log.created_at?.slice(0, 10)).filter(Boolean)).size;
    const opportunitiesSavedThisWeek = opportunityBookmarks.filter((bookmark) => bookmark.created_at?.slice(0, 10) >= weekStart).length;
    return { posts: weekPosts.length, completedGoals: goalsCompletedThisWeek, goalsCreated: goalsCreatedThisWeek, opportunitiesSaved: opportunitiesSavedThisWeek, activeDays };
  }, [logs, customMilestones, user, opportunityBookmarks]);

  const challengeProgress = getChallengeProgress({
    posts: weeklyInsights.posts,
    goals: customMilestones,
    opportunitiesSaved: weeklyInsights.opportunitiesSaved,
    weekStart: getCurrentWeekStart(),
  });

  const onboardingSteps = [
    {
      label: 'Add a short profile bio',
      complete: Boolean(profile.bio.trim()),
      action: () => setActiveTab('profile'),
    },
    {
      label: 'Share your first progress update',
      complete: logs.some((log) => log.user_id === user?.id),
      action: () => document.getElementById('wall-compose')?.scrollIntoView({ behavior: 'smooth' }),
    },
    {
      label: 'Create your first learning goal',
      complete: customMilestones.length > 0,
      action: () => setActiveTab('tech'),
    },
    {
      label: 'Save an opportunity to explore',
      complete: opportunityBookmarks.length > 0,
      action: () => setActiveTab('opportunities'),
    },
  ];
  const onboardingDismissed = Boolean(user?.id && (
    onboardingDismissedUserId === user.id
    || (typeof window !== 'undefined' && window.localStorage.getItem(`odyssey-onboarding-dismissed:${user.id}`) === 'true')
  ));

  if (!user) {
    if (loadingData) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#080D18] text-slate-100">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-400" role="status">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-400" />
            Preparing your Odyssey...
          </div>
        </main>
      );
    }

    return (
      <main className="odyssey-landing min-h-screen overflow-hidden bg-[#080D18] text-slate-100 selection:bg-indigo-500 selection:text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(20,184,166,0.13),transparent_45%)]" />
        <div className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(148,163,184,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.25)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
          <header className="flex items-center justify-between border-b border-white/[0.08] py-4 sm:py-5">
            <Link href="/" className="flex items-center gap-3 rounded-xl" aria-label="Odyssey home">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-400/10 text-teal-300 shadow-lg shadow-teal-950/30">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-bold tracking-tight text-white">Odyssey</span>
                <span className="block text-[11px] text-slate-500">Make room for your next step</span>
              </span>
            </Link>
            <nav aria-label="Account navigation" className="flex items-center gap-1 sm:gap-3">
              <a
                href="#how-it-works"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-white sm:inline-flex"
              >
                Explore
              </a>
              <Link
                href="/auth"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/auth"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-950/40 transition-all hover:-translate-y-0.5 hover:bg-indigo-400"
              >
                Get started <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </nav>
          </header>

          <section className="relative grid min-h-[590px] items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/[0.07] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-200">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
                Your next chapter starts here
              </span>
              <h1 className="mt-6 max-w-[12ch] text-[2.7rem] font-semibold leading-[1.04] tracking-[-0.055em] text-white sm:text-6xl lg:text-[4.4rem]">
                Turn learning into
                <br />
                <span className="text-indigo-300">real momentum.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
                Odyssey gives student builders one focused place to set personal goals, record progress, and discover opportunities worth pursuing.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-950/40 transition-all hover:-translate-y-0.5 hover:bg-indigo-400"
                >
                  Build your momentum <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-slate-300 transition-colors hover:border-teal-300/30 hover:bg-white/[0.03] hover:text-white"
                >
                  See how it works
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.08] pt-5 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-300" /> Goals you choose</span>
                <span className="inline-flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-300" /> Progress at your pace</span>
                <span className="inline-flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-teal-300" /> A community that gets it</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl lg:pl-2">
              <div className="absolute -inset-10 rounded-full bg-teal-400/[0.08] blur-3xl" />
              <div className="absolute -right-5 top-8 h-24 w-24 rounded-full border border-teal-300/10" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.11] bg-[#101a26]/95 p-4 shadow-2xl shadow-black/40 sm:p-6">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/60 to-transparent" />
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-300/10 text-teal-200">
                      <Activity className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">Your momentum, in one place</p>
                      <p className="mt-1 text-xs text-slate-500">A preview of your Odyssey workspace</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-teal-300/15 bg-teal-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-teal-200">
                    YOUR SPACE
                  </span>
                </div>
                <div className="grid gap-3 py-4 sm:grid-cols-[1.1fr_0.9fr]">
                  <article className="rounded-2xl border border-white/[0.07] bg-[#0b121d] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Goal tracker</p>
                        <h2 className="mt-2 text-sm font-semibold text-white">Build a small web project</h2>
                      </div>
                      <span className="rounded-lg bg-teal-300/10 p-2 text-teal-200">
                        <Cpu className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="mt-5 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Example progress</span>
                      <span className="font-semibold text-teal-200">3 of 5 steps</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="img" aria-label="Example goal progress: three of five steps">
                      <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-teal-500 to-teal-300" />
                    </div>
                    <div className="mt-4 space-y-2.5">
                      {[
                        ['Choose a project idea', true],
                        ['Sketch the first screen', true],
                        ['Build the main layout', true],
                        ['Add an interactive feature', false],
                      ].map(([task, complete]) => (
                        <div key={task} className="flex items-center gap-2.5 text-[11px]">
                          <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${complete ? 'border-teal-300/30 bg-teal-300/15 text-teal-200' : 'border-slate-700 text-slate-600'}`}>
                            {complete && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
                          </span>
                          <span className={complete ? 'text-slate-400' : 'text-slate-200'}>{task}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                  <div className="flex flex-col gap-3">
                    <article className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Zap className="h-4 w-4 text-amber-300" aria-hidden="true" />
                        <p className="text-xs font-semibold">Learning log</p>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-400">Capture a lesson, a small win, or the next step you want to take.</p>
                    </article>
                    <article className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Compass className="h-4 w-4 text-teal-200" aria-hidden="true" />
                        <p className="text-xs font-semibold">Opportunities</p>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-400">Keep programs, grants, and events you want to explore close by.</p>
                    </article>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-teal-300/10 bg-teal-300/[0.05] p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-300/10 text-teal-200">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <p className="text-xs leading-5 text-slate-300">
                    No preset goals. Shape a path that feels like yours, then keep moving one step at a time.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section id="how-it-works" className="scroll-mt-8 border-t border-white/[0.08] py-16 sm:py-20">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Built around your progress</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                One workspace. A path that is yours.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Turn big ambitions into manageable steps, keep a record of what you are learning, and find your next opportunity without losing sight of your own goals.
              </p>
            </div>
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Zap, title: 'Daily learning log', detail: 'Reflect on what you learned and share milestones with your community.', color: 'text-amber-300 bg-amber-300/10' },
                { icon: Compass, title: 'Curated opportunities', detail: 'Keep grants, programs, and events in one place as you plan what is next.', color: 'text-indigo-300 bg-indigo-300/10' },
                { icon: Cpu, title: 'Personal goal tracker', detail: 'Create your own learning goals across technology and other interests.', color: 'text-emerald-300 bg-emerald-300/10' },
                { icon: BarChart2, title: 'Momentum insights', detail: 'Look back on your activity and celebrate consistency over time.', color: 'text-sky-300 bg-sky-300/10' },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <article key={item.title} className="group rounded-2xl border border-white/[0.08] bg-[#0d1520]/70 p-5 transition-all duration-200 hover:-translate-y-1 hover:border-teal-300/20 hover:bg-[#101a26]">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${item.color}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-sm font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-3xl border border-teal-300/15 bg-gradient-to-br from-teal-950/40 via-[#101a26] to-[#101a26] px-6 py-9 sm:px-9 sm:py-11">
            <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full bg-teal-400/[0.08] blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div className="max-w-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">Your pace. Your direction.</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Start with one step that matters to you.</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Set a goal, make a little progress, and come back when you are ready for the next step.
                </p>
              </div>
              <Link
                href="/auth"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-950/40 transition-all hover:-translate-y-0.5 hover:bg-indigo-400"
              >
                Get started with Odyssey <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <footer className="flex flex-col gap-3 border-t border-white/[0.08] py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Odyssey — steady progress, shared momentum.</span>
            <Link href="/auth" className="font-medium text-slate-300 transition-colors hover:text-white">
              Join the community <span aria-hidden="true">→</span>
            </Link>
          </footer>
        </div>
      </main>
    );
  }

  return (
    <div className="odyssey-dashboard min-h-screen bg-[#0B0F19] text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      
      {/* BACKGROUND GRID OVERLAY */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <div className="dashboard-content max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6 relative z-10">

        {/* ================= WORKSPACE HEADER ================= */}
        <header className="dashboard-topbar grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 rounded-2xl border border-slate-800 bg-[#111827]/90 p-3 shadow-xl sm:p-4">
          
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#0B0F19] rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight text-white">Odyssey</h1>
              <p className="text-[10px] text-slate-500">Student workspace</p>
            </div>
          </div>

          {/* TAB BAR */}
          <nav aria-label="Main navigation" className="dashboard-nav col-span-2 flex w-full items-center justify-start gap-1 overflow-x-auto rounded-xl border border-slate-800/80 bg-[#080f18]/80 p-1.5">
            {[
              { id: 'feed', label: 'Wall', icon: Zap },
              { id: 'friends', label: 'Friends', icon: Users },
              { id: 'opportunities', label: 'Opportunities', icon: Compass },
              { id: 'tech', label: 'Goals', icon: Cpu },
              { id: 'leaderboard', label: 'Rankings', icon: Trophy },
              { id: 'analytics', label: 'Analytics', icon: BarChart2 },
              { id: 'profile', label: 'Settings', icon: Settings },
              ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: ShieldCheck }] : [])
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`Open ${tab.label}`}
                  className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                    isActive 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.id === 'friends' && incomingFriendRequests.length + unreadMessageCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-700 px-1 text-[9px] text-white" aria-label={`${incomingFriendRequests.length} friend requests and ${unreadMessageCount} unread messages`}>
                      {incomingFriendRequests.length + unreadMessageCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* AUTH STATUS */}
          <div className="flex min-w-0 items-center justify-end gap-2">
            {user ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <ProfileAvatar src={profile.avatar_url} name={profile.full_name} className="h-8 w-8 shrink-0 rounded-lg" />
                <div className="hidden min-w-0 text-left sm:block">
                  <span className="block max-w-36 truncate text-xs font-semibold text-slate-200">{profile.full_name || 'Your account'}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('profile')}
                    className="text-[10px] text-slate-500 transition-colors hover:text-teal-200"
                  >
                    Account
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="min-h-10 rounded-lg border border-slate-700 px-3 text-[11px] font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-slate-400 sm:inline">Your momentum starts here.</span>
                <Link
                  href="/auth"
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5" /> Join Odyssey
                </Link>
              </div>
            )}
          </div>
        </header>

        {dataErrors.length > 0 && (
          <section
            role="alert"
            aria-live="assertive"
            aria-label="Dashboard data status"
            className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 sm:px-5"
          >
            <p className="text-xs font-semibold text-amber-100">Some workspace data could not be loaded.</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-100/80">
              {dataErrors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          </section>
        )}

        {/* ================= TAB 1: LIVE WALL ================= */}
        {activeTab === 'feed' && (
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-3xl border border-indigo-400/15 bg-gradient-to-br from-indigo-950 via-[#111827] to-[#111827] p-6 shadow-xl shadow-indigo-950/20 sm:p-8">
              <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
              <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
                <div className="max-w-2xl space-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-200">
                    <Sparkles className="h-3.5 w-3.5" /> Your daily momentum
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Small steps. <span className="text-indigo-300">Real momentum.</span>
                  </h2>
                  <p className="max-w-xl text-sm leading-6 text-slate-300">
                    Share what you are learning, celebrate the work in progress, and keep building alongside students who get it.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                      <Flame className="h-3.5 w-3.5" /> {profile.current_streak} day streak
                    </span>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <a href="#wall-compose" className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300/20 bg-teal-300/[0.06] px-3 py-2 text-xs font-semibold text-teal-100 transition-colors hover:bg-teal-300/10">
                        Share an update <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setActiveTab('opportunities')}
                        className="inline-flex items-center gap-1.5 px-2 py-2 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
                      >
                        Find an opportunity <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 md:min-w-[330px]">
                  {[
                    { label: 'Community posts', value: activityStats.totalPosts },
                    { label: 'Opportunities', value: opportunities.length },
                    { label: 'Goals progress', value: `${roadmapStats.pct}%` },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 sm:p-4">
                      <p className="text-lg font-bold text-white sm:text-xl">{stat.value}</p>
                      <p className="mt-1 text-[10px] leading-4 text-slate-400 sm:text-xs">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {!onboardingDismissed && onboardingSteps.some((step) => !step.complete) && (
              <section aria-labelledby="onboarding-heading" className="rounded-2xl border border-teal-800/60 bg-teal-950/20 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="onboarding-heading" className="text-sm font-bold text-white">A quick start for your workspace</h3>
                    <p className="mt-1 text-xs text-slate-400">A few optional steps help you get value from Odyssey.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      window.localStorage.setItem(`odyssey-onboarding-dismissed:${user.id}`, 'true');
                      setOnboardingDismissedUserId(user.id);
                    }}
                    className="min-h-9 rounded-lg px-2 text-xs text-slate-400 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
                <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {onboardingSteps.map((step) => (
                    <li key={step.label}>
                      <button
                        type="button"
                        disabled={step.complete}
                        onClick={() => step.action()}
                        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-slate-800 bg-[#0B0F19]/70 p-3 text-left text-xs text-slate-200 enabled:hover:border-teal-700 disabled:cursor-default"
                      >
                        {step.complete
                          ? <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                          : <Circle className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />}
                        {step.label}
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Community challenges</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Optional prompts reset every Monday. Progress counts this week’s posts, goal progress, or saved opportunities; complete the target before marking a challenge done.
                  </p>
                </div>
                <span className="text-[10px] text-slate-500">
                  {challengeParticipation.filter((item) => item.challenge_key.startsWith(`${getCurrentWeekStart()}:`)).length} joined
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {COMMUNITY_CHALLENGES.map((challenge) => {
                  const Icon = challenge.icon;
                  const participation = challengeParticipation.find(
                    (item) => item.challenge_key === `${getCurrentWeekStart()}:${challenge.id}`
                  );
                  const joined = Boolean(participation);
                  const completed = Boolean(participation?.completed_at);
                  const progress = challengeProgress[challenge.id] || 0;
                  const canComplete = joined && !completed && progress >= challenge.targetCount;
                  return (
                    <article key={challenge.id} className="rounded-xl border border-slate-800 bg-[#0B0F19]/70 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-400/10 text-indigo-300"><Icon className="h-4 w-4" /></span>
                        <span className={`rounded-full border px-2 py-1 text-[10px] ${completed ? 'border-emerald-700 bg-emerald-400/10 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>
                          {completed ? 'Completed' : challenge.target}
                        </span>
                      </div>
                      <h4 className="mt-3 text-xs font-bold text-white">{challenge.title}</h4>
                      <p className="mt-1 min-h-10 text-[11px] leading-5 text-slate-400">{challenge.description}</p>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                        <span>This week</span>
                        <span className="font-mono text-slate-300">
                          {progress}/{challenge.targetCount}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (progress / challenge.targetCount) * 100)}%` }} />
                      </div>
                      {joined && !completed && (
                        <button
                          type="button"
                          onClick={() => completeChallenge(challenge.id)}
                          disabled={!canComplete}
                          className="mt-3 w-full rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-2 text-[11px] font-semibold text-indigo-200 transition-colors enabled:hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {canComplete ? 'Complete challenge' : 'Complete the steps to finish'}
                        </button>
                      )}
                      {!completed && (
                        <button type="button" onClick={() => toggleChallenge(challenge.id)} className={`mt-2 w-full rounded-lg border px-3 py-2 text-[11px] font-semibold ${joined ? 'border-emerald-800 text-emerald-300' : 'border-slate-700 text-slate-300 hover:border-indigo-500 hover:text-white'}`}>
                          {joined ? 'Leave challenge' : 'Join challenge'}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            {/* INPUT FORM */}
            <div id="wall-compose" className="scroll-mt-36 bg-[#111827] p-4 sm:p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" /> Share a progress update
                </h2>
                <span className="text-[11px] text-slate-500 font-mono">
                  {logInput.length} / 500 characters
                </span>
              </div>

              <form onSubmit={handlePostLog} className="space-y-3">
                <textarea
                  maxLength={500}
                  aria-label="Daily accomplishment"
                  className="w-full p-4 bg-[#0B0F19] border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-600 text-sm transition-all"
                  rows={3}
                  placeholder="Record your daily engineering output, research milestone, or technical breakthrough..."
                  value={logInput}
                  onChange={(e) => setLogInput(e.target.value)}
                />

                <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs text-slate-400 font-medium">Domain Track:</span>
                    <select
                      value={logCategory}
                      onChange={(e) => setLogCategory(e.target.value)}
                      className="bg-[#0B0F19] border border-slate-800 text-xs font-bold rounded-lg px-3 py-2 text-indigo-400 outline-none"
                    >
                      <option value="Tech">Tech & Software</option>
                      <option value="Business">Business & Venture</option>
                      <option value="Creative">Creative & Product</option>
                      <option value="Science">Hardware & Research</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingLog || !logInput.trim()}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-indigo-600/20"
                  >
                    <Send className="w-3.5 h-3.5" /> {submittingLog ? 'Dispatching...' : 'Publish Update'}
                  </button>
                </div>
              </form>
            </div>

            {/* SEARCH & FILTER STRIP */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-[#111827]/60 p-3 rounded-xl border border-slate-800">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by keyword or author..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-[#0B0F19] border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-1 overflow-x-auto w-full sm:w-auto no-scrollbar">
                {['All', 'Tech', 'Business', 'Creative', 'Science'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      selectedFilter === cat
                        ? 'bg-indigo-600/20 border border-indigo-500 text-indigo-300'
                        : 'bg-[#0B0F19] border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* LIVE FEED STREAM */}
            <div className="space-y-4">
              {loadingData ? (
                <>
                  <CardSkeleton />
                  <CardSkeleton />
                </>
              ) : filteredLogs.length === 0 ? (
                /* PROFESSIONAL EMPTY STATE */
                <div className="text-center py-16 bg-[#111827]/40 rounded-2xl border border-dashed border-slate-800 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-500">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-300">No updates yet</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      There are currently no active public logs matching your filter criteria. Be the first student to broadcast an update!
                    </p>
                  </div>
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="bg-[#111827] p-5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar
                          src={log.profiles?.avatar_url}
                          name={log.profiles?.full_name}
                          className="h-10 w-10 rounded-xl"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200 text-sm">
                              {log.profiles?.full_name || 'Anonymous Student'}
                            </span>
                            <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded font-mono">
                              {log.category || log.profiles?.category || 'Tech'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {formatLogDate(log.created_at)}
                          </span>
                          {log.profiles?.location && (
                            <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                              <MapPin className="h-3 w-3" /> {log.profiles.location}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-emerald-400 font-mono font-bold text-xs bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-full">
                        <Flame className="w-3.5 h-3.5 fill-emerald-400" />
                        {log.profiles?.current_streak ?? 0}d Streak
                      </div>
                    </div>

                    <p className="text-slate-300 text-sm leading-relaxed pl-1 font-normal">
                      {log.content}
                    </p>
                    {log.profiles?.bio && (
                      <p className="border-l border-slate-700 pl-3 text-xs leading-relaxed text-slate-400">
                        {log.profiles.bio}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {[
                        ['Website', log.profiles?.website_url],
                        ['GitHub', log.profiles?.github],
                        ['LinkedIn', log.profiles?.linkedin],
                        ['Portfolio', log.profiles?.portfolio],
                      ].filter(([, href]) => isSafeHttpUrl(href)).map(([label, href]) => (
                        <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 transition-colors hover:text-indigo-200">
                          <ExternalLink className="h-3 w-3" /> {label}
                        </a>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/80 text-slate-400 text-xs">
                      <button
                        type="button"
                        onClick={() => handleReaction(log.id, 'high_fives')}
                        disabled={myWallReactions.some((reaction) => reaction.daily_log_id === log.id && reaction.reaction_type === 'high_five')
                          || pendingWallReactions.includes(`${log.id}:high_fives`)}
                        className="flex items-center gap-1.5 hover:text-indigo-400 bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        {myWallReactions.some((reaction) => reaction.daily_log_id === log.id && reaction.reaction_type === 'high_five') ? 'High Fived' : 'High Five'} ({log.high_fives || 0})
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReaction(log.id, 'supports')}
                        disabled={myWallReactions.some((reaction) => reaction.daily_log_id === log.id && reaction.reaction_type === 'support')
                          || pendingWallReactions.includes(`${log.id}:supports`)}
                        className="flex items-center gap-1.5 hover:text-emerald-400 bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Heart className="w-3.5 h-3.5" />
                        {myWallReactions.some((reaction) => reaction.daily_log_id === log.id && reaction.reaction_type === 'support') ? 'Supported' : 'Support'} ({log.supports || 0})
                      </button>
                      {log.user_id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => openReportForm('daily_log', log.id)}
                          aria-label={`Report ${log.profiles?.full_name || 'student'}'s update`}
                          className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1 text-[11px] text-slate-500 hover:border-rose-900 hover:text-rose-200"
                        >
                          <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        )}

        {/* ================= FRIENDS & DIRECT MESSAGES ================= */}
        {activeTab === 'friends' && (
          <section className="space-y-5">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">Friends & messages</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Find public student profiles, connect by request, and message accepted friends privately.
                </p>
              </div>
              <span className="rounded-full border border-teal-900/70 bg-teal-950/30 px-3 py-1 text-xs text-teal-200">
                {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
              </span>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#0B0F19]/70 px-3 py-2 text-[11px]">
              <span className="text-slate-300">
                {incomingFriendRequests.length > 0
                  ? `${incomingFriendRequests.length} new friend ${incomingFriendRequests.length === 1 ? 'request' : 'requests'}`
                  : 'Friend requests and messages update automatically.'}
              </span>
              <span className={realtimeStatus === 'live' ? 'text-emerald-300' : 'text-slate-500'}>
                {realtimeStatus === 'live' ? 'Live updates on' : realtimeStatus === 'fallback' ? 'Live updates unavailable · checking periodically' : 'Connecting…'}
              </span>
            </div>

            {friendLoadError && (
              <div role="alert" className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-xs leading-5 text-amber-100">
                {friendLoadError}
                {(friendLoadError.includes('friend_requests') || friendLoadError.includes('direct_messages')) && (
                  <span> Apply the Friends and Messages migration in the Supabase SQL Editor, then refresh.</span>
                )}
              </div>
            )}

            <div className="grid min-h-[620px] gap-4 xl:grid-cols-[350px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <section className="rounded-2xl border border-slate-800 bg-[#111827] p-4">
                  <label htmlFor="friend-search" className="text-xs font-semibold text-slate-200">Find students</label>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">Search by name. Only profiles set to public appear.</p>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden="true" />
                    <input
                      id="friend-search"
                      type="search"
                      value={friendSearch}
                      onChange={(event) => {
                        setFriendSearch(event.target.value);
                        if (event.target.value.trim().length < 2) setFriendSearchResults([]);
                      }}
                      placeholder="Type at least 2 characters"
                      autoComplete="off"
                      className="min-h-11 w-full rounded-xl border border-slate-700 bg-[#0B0F19] py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
                    />
                  </div>
                  {friendSearch.trim().length >= 2 && (
                    <div className="mt-3 space-y-2" aria-live="polite">
                      {friendSearchResults.length === 0 ? (
                        <p className="rounded-lg bg-[#0B0F19] p-3 text-xs text-slate-500">No public profiles found.</p>
                      ) : friendSearchResults.map((candidate) => {
                        const relation = friendRequests.find((request) => (
                          (request.requester_id === user.id && request.recipient_id === candidate.id)
                          || (request.recipient_id === user.id && request.requester_id === candidate.id)
                        ));
                        const incoming = relation?.status === 'pending' && relation.recipient_id === user.id;
                        const alreadyFriend = relation?.status === 'accepted'
                          || friends.some((friend) => friend.id === candidate.id);
                        const pending = relation?.status === 'pending';
                        return (
                          <article key={candidate.id} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0B0F19]/70 p-2.5">
                            <ProfileAvatar src={candidate.avatar_url} name={candidate.full_name} className="h-9 w-9 shrink-0 rounded-xl" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-200">{candidate.full_name || 'Student builder'}</p>
                              <p className="truncate text-[10px] text-slate-500">{candidate.category || 'Student'}{candidate.location ? ` · ${candidate.location}` : ''}</p>
                            </div>
                            {alreadyFriend ? (
                              <span className="text-[10px] font-semibold text-emerald-300">Friend</span>
                            ) : incoming ? (
                              <button
                                type="button"
                                disabled={respondingFriendRequestId === relation.id}
                                onClick={() => respondToFriendRequest(relation, 'accepted')}
                                className="min-h-9 rounded-lg border border-emerald-800 px-2.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
                              >
                                Accept
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={pending || sendingFriendRequestId === candidate.id}
                                onClick={() => sendFriendRequest(candidate)}
                                className="min-h-9 rounded-lg border border-teal-800 px-2.5 text-[10px] font-semibold text-teal-200 hover:bg-teal-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {pending ? 'Request sent' : sendingFriendRequestId === candidate.id ? 'Sending…' : 'Add friend'}
                              </button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-800 bg-[#111827] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-bold text-white">Friend requests</h3>
                    {incomingFriendRequests.length > 0 && (
                      <span className="rounded-full bg-rose-900/60 px-2 py-0.5 text-[10px] text-rose-200">{incomingFriendRequests.length} new</span>
                    )}
                  </div>
                  {friendsLoading && friendRequests.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500" role="status">Loading requests…</p>
                  ) : incomingFriendRequests.length === 0 && outgoingFriendRequests.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">No pending requests.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {incomingFriendRequests.map((request) => {
                        const requester = friendPeerProfiles.find((item) => item.id === request.requester_id);
                        return (
                          <article key={request.id} className="rounded-xl border border-slate-800 bg-[#0B0F19]/70 p-3">
                            <div className="flex items-center gap-2">
                              <ProfileAvatar src={requester?.avatar_url} name={requester?.full_name} className="h-8 w-8 shrink-0 rounded-lg" />
                              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{requester?.full_name || 'Student builder'}</p>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={respondingFriendRequestId === request.id}
                                onClick={() => respondToFriendRequest(request, 'accepted')}
                                className="min-h-9 flex-1 rounded-lg bg-teal-800 px-2 text-[10px] font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                disabled={respondingFriendRequestId === request.id}
                                onClick={() => respondToFriendRequest(request, 'declined')}
                                className="min-h-9 flex-1 rounded-lg border border-slate-700 px-2 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {outgoingFriendRequests.map((request) => {
                        const recipient = friendPeerProfiles.find((item) => item.id === request.recipient_id);
                        return (
                          <p key={request.id} className="rounded-lg bg-[#0B0F19]/70 px-3 py-2 text-[11px] text-slate-400">
                            Request sent to {recipient?.full_name || 'a student'} · awaiting response
                          </p>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-800 bg-[#111827] p-4">
                  <h3 className="text-xs font-bold text-white">Your friends</h3>
                  {friendsLoading && friends.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500" role="status">Loading friends…</p>
                  ) : friends.length === 0 ? (
                    <p className="mt-3 text-xs leading-5 text-slate-500">Accepted friend connections will appear here. Search for a student above to get started.</p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {friends.map((friend) => (
                        <li key={friend.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setDirectMessages([]);
                              setSelectedFriendId(friend.id);
                            }}
                            aria-current={selectedFriendId === friend.id ? 'true' : undefined}
                            className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-colors ${
                              selectedFriendId === friend.id
                                ? 'border-teal-700/70 bg-teal-950/30'
                                : 'border-transparent hover:bg-slate-900'
                            }`}
                          >
                            <ProfileAvatar src={friend.avatar_url} name={friend.full_name} className="h-9 w-9 shrink-0 rounded-xl" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-slate-200">{friend.full_name || 'Student builder'}</span>
                              <span className="block truncate text-[10px] text-slate-500">{friend.category || 'Odyssey member'}</span>
                            </span>
                            {friendUnreadCounts[friend.id] > 0 && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white" aria-label={`${friendUnreadCounts[friend.id]} unread messages`}>
                                {friendUnreadCounts[friend.id]}
                              </span>
                            )}
                            <MessageCircle className="h-4 w-4 text-slate-500" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="rounded-2xl border border-slate-800 bg-[#111827] p-4">
                  <h3 className="text-xs font-bold text-white">Blocked members</h3>
                  {blockedUserIds.length === 0 ? (
                    <p className="mt-2 text-[11px] text-slate-500">No blocked members.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {blockedUserIds.map((blockedId) => {
                        const blockedProfile = friendPeerProfiles.find((item) => item.id === blockedId);
                        return (
                          <li key={blockedId} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0B0F19]/70 p-2.5">
                            <ProfileAvatar src={blockedProfile?.avatar_url} name={blockedProfile?.full_name} className="h-8 w-8 shrink-0 rounded-lg" />
                            <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{blockedProfile?.full_name || 'Blocked member'}</span>
                            <button
                              type="button"
                              disabled={friendActionBusyId === blockedId}
                              onClick={() => unblockUser(blockedId)}
                              className="min-h-9 rounded-lg border border-slate-700 px-2.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                            >
                              Unblock
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="mt-2 text-[10px] leading-4 text-slate-500">Blocking hides profiles and prevents friend requests and messages. Unblocking does not restore a friendship.</p>
                </section>
              </aside>

              <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
                {friends.find((friend) => friend.id === selectedFriendId) ? (
                  <>
                    {(() => {
                      const conversationFriend = friends.find((friend) => friend.id === selectedFriendId);
                      return (
                        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 p-4">
                          <ProfileAvatar src={conversationFriend.avatar_url} name={conversationFriend.full_name} className="h-10 w-10 rounded-xl" />
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-white">{conversationFriend.full_name || 'Student builder'}</h3>
                            <p className="text-[11px] text-emerald-300">Friend · private conversation{friendUnreadCounts[conversationFriend.id] > 0 ? ` · ${friendUnreadCounts[conversationFriend.id]} unread` : ''}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={friendActionBusyId === conversationFriend.id}
                              onClick={() => openReportForm('member', conversationFriend.id)}
                              className="min-h-9 rounded-lg border border-slate-700 px-2.5 text-[10px] font-semibold text-slate-400 hover:border-amber-800 hover:text-amber-200 disabled:opacity-50"
                            >
                              Report conversation
                            </button>
                            <button
                              type="button"
                              disabled={friendActionBusyId === conversationFriend.id}
                              onClick={() => removeFriend(conversationFriend)}
                              className="min-h-9 rounded-lg border border-slate-700 px-2.5 text-[10px] font-semibold text-slate-400 hover:border-slate-500 hover:text-white disabled:opacity-50"
                            >
                              Remove friend
                            </button>
                            <button
                              type="button"
                              disabled={friendActionBusyId === conversationFriend.id}
                              onClick={() => blockUser(conversationFriend)}
                              className="min-h-9 rounded-lg border border-rose-900/70 px-2.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                            >
                              {friendActionBusyId === conversationFriend.id ? 'Working…' : 'Block'}
                            </button>
                          </div>
                        </header>
                      );
                    })()}
                    <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-label="Conversation messages">
                      {directMessages.length === 0 ? (
                        <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                          <MessageCircle className="h-8 w-8 text-slate-600" aria-hidden="true" />
                          <p className="mt-3 text-sm font-semibold text-slate-300">Start the conversation</p>
                          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Messages are private to you and your accepted friend.</p>
                        </div>
                      ) : directMessages.map((message) => {
                        const ownMessage = message.sender_id === user.id;
                        return (
                          <div key={message.id} className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}>
                            <article className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[75%] ${
                              ownMessage
                                ? 'rounded-br-md bg-teal-800/80 text-white'
                                : 'rounded-bl-md border border-slate-700 bg-[#0B0F19] text-slate-200'
                            }`}>
                              <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.content}</p>
                              <time dateTime={message.created_at} className={`mt-1 block text-right text-[9px] ${ownMessage ? 'text-teal-100/70' : 'text-slate-500'}`}>
                                {formatLogDate(message.created_at)}
                              </time>
                            </article>
                          </div>
                        );
                      })}
                    </div>
                    <form onSubmit={sendDirectMessage} className="border-t border-slate-800 p-3 sm:p-4">
                      <label htmlFor="direct-message-input" className="sr-only">Write a message</label>
                      <div className="flex items-end gap-2">
                        <textarea
                          id="direct-message-input"
                          rows={2}
                          maxLength={2000}
                          value={messageInput}
                          onChange={(event) => setMessageInput(event.target.value)}
                          placeholder="Write a message…"
                          className="min-h-12 flex-1 resize-y rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white placeholder:text-slate-600"
                        />
                        <button
                          type="submit"
                          disabled={!messageInput.trim() || sendingMessage}
                          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Send className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden sm:inline">{sendingMessage ? 'Sending…' : 'Send'}</span>
                        </button>
                      </div>
                      <p className="mt-1 text-right text-[10px] text-slate-600">{messageInput.length}/2000</p>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <Users className="h-9 w-9 text-slate-600" aria-hidden="true" />
                    <h3 className="mt-3 text-sm font-semibold text-slate-300">Your private conversations</h3>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                      Accept or send a friend request. Once it’s accepted, select that friend here to start messaging.
                    </p>
                  </div>
                )}
              </section>

            </div>
          </section>
        )}

        {/* ================= TAB 2: OPPORTUNITIES HUB ================= */}
        {(activeTab === 'opportunities' || activeTab === 'admin') && (
          <div className="space-y-6">
            {activeTab === 'admin' && isAdmin && (
              <section className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-white">Admin workspace</h2>
                  <p className="mt-1 text-xs text-slate-400">Community health, moderation, account controls, and opportunity publishing.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['Student profiles', adminStats.users],
                    ['Live Wall posts', adminStats.posts],
                    ['Opportunities', adminStats.opportunities],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-800 bg-[#111827] p-4">
                      <p className="text-[10px] font-mono uppercase text-slate-500">{label}</p>
                      <p className="mt-2 text-2xl font-bold text-white">{adminLoading ? '…' : value}</p>
                      <p className="mt-1 text-[10px] text-slate-500">Current platform total</p>
                    </div>
                  ))}
                </div>

                <section className="space-y-4 rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white">Opportunity Sources</h3>
                      <span className="rounded-full border border-emerald-800/70 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Official sources only</span>
                    </div>
                    <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-400">
                      Register documented APIs, feeds, and CSV exports. Mark a source verified only after confirming the publisher documents the endpoint and permits its use. RSS/Atom feeds can be synced into the private admin review queue; nothing is published to students until approved.
                    </p>
                  </div>

                  {opportunitySourceLoadError && (
                    <p role="alert" className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
                      Opportunity sources unavailable: {opportunitySourceLoadError}
                    </p>
                  )}

                  <form onSubmit={handleOpportunitySourceSubmit} className="space-y-3 rounded-xl border border-slate-800 bg-[#0B0F19]/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-semibold text-slate-200">
                        {editingOpportunitySourceId ? 'Edit source' : 'Register a source'}
                      </h4>
                      {editingOpportunitySourceId && (
                        <button type="button" onClick={resetOpportunitySourceForm} className="text-[10px] text-slate-400 hover:text-white">
                          Cancel edit
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-1 text-[10px] text-slate-400">
                        Source name
                        <input
                          required
                          maxLength={120}
                          value={opportunitySourceForm.name}
                          onChange={(event) => setOpportunitySourceForm((previous) => ({ ...previous, name: event.target.value }))}
                          placeholder="Organization or program"
                          className="w-full rounded-lg border border-slate-700 bg-[#080f18] px-3 py-2 text-xs text-white"
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400">
                        Source type
                        <select
                          value={opportunitySourceForm.source_type}
                          onChange={(event) => setOpportunitySourceForm((previous) => ({
                            ...previous,
                            source_type: event.target.value,
                            publish_policy: event.target.value === 'manual' ? 'admin_review' : previous.publish_policy,
                          }))}
                          className="w-full rounded-lg border border-slate-700 bg-[#080f18] px-3 py-2 text-xs text-white"
                        >
                          <option value="api">Documented API</option>
                          <option value="feed">RSS / Atom feed</option>
                          <option value="csv">Official CSV export</option>
                          <option value="manual">Manual review</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400 md:col-span-2">
                        Endpoint URL {opportunitySourceForm.source_type === 'manual' ? '(optional reference)' : ''}
                        <input
                          type="url"
                          required={opportunitySourceForm.source_type !== 'manual'}
                          value={opportunitySourceForm.url}
                          onChange={(event) => setOpportunitySourceForm((previous) => ({ ...previous, url: event.target.value }))}
                          placeholder="https://official.example.org/feed"
                          className="w-full rounded-lg border border-slate-700 bg-[#080f18] px-3 py-2 text-xs text-white"
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400">
                        Source status
                        <select
                          value={opportunitySourceForm.status}
                          onChange={(event) => setOpportunitySourceForm((previous) => ({ ...previous, status: event.target.value }))}
                          className="w-full rounded-lg border border-slate-700 bg-[#080f18] px-3 py-2 text-xs text-white"
                        >
                          <option value="pending">Pending review</option>
                          <option value="verified">Verified</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400 md:col-span-2">
                        Publish policy
                        <select
                          value={opportunitySourceForm.publish_policy}
                          onChange={(event) => setOpportunitySourceForm((previous) => ({ ...previous, publish_policy: event.target.value }))}
                          className="w-full rounded-lg border border-slate-700 bg-[#080f18] px-3 py-2 text-xs text-white"
                        >
                          <option value="admin_review">Admin review before publishing</option>
                          <option value="auto" disabled>Automatic publishing (not available yet)</option>
                        </select>
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={savingOpportunitySource}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {savingOpportunitySource ? 'Saving…' : editingOpportunitySourceId ? 'Save source' : 'Add source'}
                    </button>
                  </form>

                  <div className="divide-y divide-slate-800 rounded-xl border border-slate-800">
                    {opportunitySources.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">
                        {adminLoading ? 'Loading registered sources…' : 'No sources registered yet.'}
                      </p>
                    ) : opportunitySources.map((source) => (
                      <article key={source.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-xs font-semibold text-white">{source.name}</h4>
                            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[9px] uppercase tracking-wide text-slate-300">{source.source_type}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                              source.status === 'verified'
                                ? 'bg-emerald-950/40 text-emerald-300'
                                : source.status === 'disabled'
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-amber-950/40 text-amber-300'
                            }`}>{source.status}</span>
                            <span className="text-[9px] text-slate-400">{source.publish_policy === 'auto' ? 'Auto publish' : 'Admin review'}</span>
                          </div>
                          {source.url && (
                            <a href={source.url} target="_blank" rel="noreferrer" className="block truncate text-[10px] text-teal-300 hover:text-teal-200">
                              {source.url}
                            </a>
                          )}
                          <p className="text-[10px] text-slate-500">
                            Last synced: {source.last_synced_at ? formatLogDate(source.last_synced_at) : 'Never'}
                            {' · '}
                            Last tested: {source.last_tested_at ? formatLogDate(source.last_tested_at) : 'Never'}
                            {source.last_test_result ? ` · ${source.last_test_result}` : ''}
                          </p>
                          {source.last_test_message && (
                            <p className={`text-[10px] ${source.last_test_result === 'failed' ? 'text-rose-300' : 'text-slate-400'}`}>
                              {source.last_test_message}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={source.source_type === 'manual' || testingOpportunitySourceId === source.id}
                            onClick={() => handleTestOpportunitySource(source)}
                            title={source.source_type === 'manual' ? 'Manual sources are reviewed by an admin, not synced.' : undefined}
                            className="rounded-lg border border-teal-800 px-2.5 py-1.5 text-[10px] font-semibold text-teal-300 hover:bg-teal-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {testingOpportunitySourceId === source.id ? 'Testing…' : 'Test sync'}
                          </button>
                          <button
                            type="button"
                            disabled={source.source_type !== 'feed' || source.status !== 'verified' || source.last_test_result !== 'passed' || syncingOpportunitySourceId === source.id}
                            onClick={() => handleSyncOpportunitySource(source)}
                            title={source.source_type !== 'feed'
                              ? 'Feed import currently supports RSS and Atom only.'
                              : source.status !== 'verified'
                                ? 'Verify the official source and its usage terms first.'
                                : source.last_test_result !== 'passed'
                                  ? 'Run a successful Test sync first.'
                                  : undefined}
                            className="rounded-lg border border-indigo-800 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {syncingOpportunitySourceId === source.id ? 'Syncing…' : 'Sync to review'}
                          </button>
                          <button type="button" onClick={() => handleEditOpportunitySource(source)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800">
                            Edit
                          </button>
                          <button type="button" onClick={() => handleDeleteOpportunitySource(source)} className="rounded-lg border border-rose-900/70 px-2.5 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-950/40">
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <p className="text-[10px] leading-4 text-slate-500">
                    Test sync only checks reachability and format. Sync to review imports up to 50 RSS/Atom entries and deduplicates items; edit or reject irrelevant entries, and approve only confirmed opportunities. API/CSV imports and scheduled sync are not enabled yet.
                  </p>
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
                  <div className="border-b border-slate-800 p-4">
                    <h3 className="text-sm font-bold text-white">Member reports</h3>
                    <p className="mt-1 text-[11px] text-slate-400">Review reports about Live Wall posts, opportunity listings, and member conversations.</p>
                    {communityReportLoadError && (
                      <p role="alert" className="mt-2 text-[11px] text-amber-200">
                        Reports are unavailable: {communityReportLoadError}. Apply the trust and safety migration if it has not been run.
                      </p>
                    )}
                  </div>
                  <div className="max-h-[24rem] divide-y divide-slate-800 overflow-y-auto">
                    {communityReports.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">{adminLoading ? 'Loading reports…' : 'No open reports.'}</p>
                    ) : communityReports.map((report) => {
                      const reportedLog = report.target_type === 'daily_log'
                        ? adminLogs.find((log) => log.id === report.target_id)
                        : null;
                      const reportedOpportunity = report.target_type === 'opportunity'
                        ? opportunities.find((opportunity) => opportunity.id === report.target_id)
                        : null;
                      const reportedMember = report.target_type === 'member'
                        ? adminProfiles.find((profileItem) => profileItem.id === report.target_id)
                        : null;
                      return (
                        <article key={report.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-200">
                              {report.target_type === 'daily_log' ? 'Live Wall post' : report.target_type === 'member' ? 'Member conversation' : 'Opportunity'} · {report.reason.replaceAll('_', ' ')}
                            </p>
                            <p className="mt-1 break-words text-xs text-slate-300">
                              {reportedLog?.content || reportedOpportunity?.title || (report.target_type === 'member'
                                ? reportedMember?.full_name || 'Reported member profile is unavailable.'
                                : 'Reported item is no longer available.')}
                            </p>
                            {report.details && <p className="mt-1 break-words text-xs text-slate-400">{report.details}</p>}
                            <p className="mt-2 text-[10px] text-slate-500">Submitted {formatLogDate(report.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => markCommunityReportReviewed(report)}
                            className="min-h-10 shrink-0 rounded-lg border border-emerald-900/70 px-3 py-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-950/40"
                          >
                            Mark reviewed
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <div className="grid gap-5 xl:grid-cols-2">
                  <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
                    <div className="border-b border-slate-800 p-4">
                      <h3 className="text-sm font-bold text-white">Live Wall moderation</h3>
                      <p className="mt-1 text-[11px] text-slate-400">Review recent posts and remove content that violates community guidelines.</p>
                    </div>
                    <div className="max-h-[28rem] divide-y divide-slate-800 overflow-y-auto">
                      {adminLogs.length === 0 ? (
                        <p className="p-5 text-xs text-slate-500">{adminLoading ? 'Loading posts…' : 'No recent posts to review.'}</p>
                      ) : adminLogs.map((log) => (
                        <article key={log.id} className="flex items-start justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-200">{log.profiles?.full_name || 'Student'}</p>
                            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{log.content}</p>
                            <p className="mt-2 text-[10px] text-slate-500">{log.category || 'Milestone'} · {formatLogDate(log.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteLog(log)}
                            className="shrink-0 rounded-lg border border-rose-900/70 px-2.5 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-950/50"
                          >
                            Remove
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
                    <div className="border-b border-slate-800 p-4">
                      <h3 className="text-sm font-bold text-white">Profile review & accounts</h3>
                      <p className="mt-1 text-[11px] text-slate-400">Review public profiles or suspend and restore sign-in access.</p>
                      {accountManagementError && (
                        <p role="status" className="mt-2 rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
                          Account controls unavailable: {accountManagementError}
                        </p>
                      )}
                      <input
                        type="search"
                        value={adminProfileSearch}
                        onChange={(event) => setAdminProfileSearch(event.target.value)}
                        placeholder="Search name, location, interest"
                        aria-label="Search student profiles"
                        className="mt-3 w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="max-h-[28rem] divide-y divide-slate-800 overflow-y-auto">
                      {filteredAdminProfiles.length === 0 ? (
                        <p className="p-5 text-xs text-slate-500">{adminLoading ? 'Loading profiles…' : 'No profiles match this search.'}</p>
                      ) : filteredAdminProfiles.map((candidate) => {
                        const isSuspended = suspendedAccountIds.includes(candidate.id);
                        return (
                          <div key={candidate.id} className="flex items-center justify-between gap-3 p-3">
                            <button
                              type="button"
                              onClick={() => {
                                setViewingProfileGoals([]);
                                setViewingProfile(candidate);
                              }}
                              className="flex min-w-0 items-center gap-3 text-left hover:text-white"
                            >
                              <ProfileAvatar src={candidate.avatar_url} name={candidate.full_name} className="h-9 w-9 rounded-xl" />
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-slate-200">{candidate.full_name || 'Anonymous Student'}</span>
                                <span className="mt-1 block truncate text-[10px] text-slate-500">{candidate.category || 'Student builder'}{candidate.location ? ` · ${candidate.location}` : ''}</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={candidate.id === user?.id || adminAccountBusy === candidate.id}
                              onClick={() => handleAccountStatus(candidate)}
                              title={candidate.id === user?.id ? 'You cannot suspend your own administrator account' : undefined}
                              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                                isSuspended
                                  ? 'border-emerald-800 text-emerald-300 hover:bg-emerald-950/40'
                                  : 'border-amber-800 text-amber-300 hover:bg-amber-950/40'
                              }`}
                            >
                              {adminAccountBusy === candidate.id ? 'Saving…' : isSuspended ? 'Restore' : 'Suspend'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-500">Showing the latest 100 profiles. Account suspension blocks sign-in and can be reversed here.</p>
                  </section>
                </div>
              </section>
            )}

            <div className="dashboard-page-heading flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Compass className="w-5 h-5 text-indigo-400" />
                  {activeTab === 'admin' ? 'Opportunity management' : 'Opportunities & Grants'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {activeTab === 'admin'
                    ? 'Review imported feed entries before approving them for students.'
                    : 'Find programs, grants, and events by location, format, or deadline.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'admin' && (
                  <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-[#0B0F19]/70 p-1" role="group" aria-label="Filter opportunities by publishing status">
                    {[
                      ['pending', 'Needs review'],
                      ['published', 'Published'],
                      ['rejected', 'Rejected'],
                      ['all', 'All'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setOpportunityStatusFilter(value)}
                        aria-pressed={opportunityStatusFilter === value}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
                          opportunityStatusFilter === value
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {activeTab === 'admin' && (
                  <a href="#opportunity-form" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-500">
                    <Plus className="h-3.5 w-3.5" /> Add opportunity
                  </a>
                )}
                <span className="text-xs font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-3 py-1 rounded-lg">
                  {filteredOpportunities.length} of {opportunities.length}
                </span>
                {activeTab === 'opportunities' && (
                  <a href="#opportunity-list" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-500">
                    Browse <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {activeTab === 'opportunities' && (
              <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Your saved opportunities</h3>
                    <p className="mt-1 text-xs text-slate-400">Keep a shortlist and track where you are in each application.</p>
                  </div>
                  <label className="text-[11px] text-slate-400">
                    Show
                    <select value={bookmarkFilter} onChange={(event) => setBookmarkFilter(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-[#0B0F19] px-2.5 py-2 text-xs text-slate-200">
                      <option value="all">All saved</option>
                      <option value="saved">Saved</option>
                      <option value="interested">Interested</option>
                      <option value="applied">Applied</option>
                    </select>
                  </label>
                </div>
                {bookmarkedOpportunities.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-slate-800 px-4 py-5 text-center text-xs text-slate-500">
                    {opportunityBookmarks.length ? 'No saved opportunities match this status.' : 'Save an opportunity below to start your shortlist.'}
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {bookmarkedOpportunities.map((bookmark) => (
                      <article key={bookmark.id} className="rounded-xl border border-slate-800 bg-[#0B0F19]/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-xs font-bold text-white">{bookmark.opportunity.title}</h4>
                            <p className="mt-1 text-[11px] text-slate-500">{bookmark.opportunity.organization}</p>
                          </div>
                          <button type="button" onClick={() => toggleOpportunityBookmark(bookmark.opportunity)} className="text-[10px] text-rose-300 hover:text-rose-200">Remove</button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className="text-[10px] text-slate-500">
                            Application status
                            <select value={bookmark.status} onChange={(event) => updateBookmark(bookmark.id, { status: event.target.value })} className="ml-2 rounded-lg border border-slate-700 bg-[#111827] px-2 py-1.5 text-[10px] text-slate-200">
                              <option value="saved">Saved</option>
                              <option value="interested">Interested</option>
                              <option value="applied">Applied</option>
                            </select>
                          </label>
                          {bookmark.opportunity.apply_url && isSafeHttpUrl(bookmark.opportunity.apply_url) && (
                            <a href={bookmark.opportunity.apply_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold text-indigo-300 hover:text-indigo-200">Open application ↗</a>
                          )}
                        </div>
                        <label className="mt-3 block text-[10px] text-slate-500">
                          Personal note
                          <textarea
                            key={`${bookmark.id}-${bookmark.notes}`}
                            defaultValue={bookmark.notes}
                            maxLength={1000}
                            rows={2}
                            onBlur={(event) => {
                              if (event.target.value !== bookmark.notes) updateBookmark(bookmark.id, { notes: event.target.value });
                            }}
                            placeholder="Add a reminder or application note…"
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-xs text-slate-200"
                          />
                        </label>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'opportunities' && (
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-[#111827]/70 p-4 sm:grid-cols-2 lg:grid-cols-5">
                <label className="space-y-1 text-[11px] font-medium text-slate-400">
                  Search
                  <input
                    type="search"
                    value={opportunitySearch}
                    onChange={(event) => setOpportunitySearch(event.target.value)}
                    placeholder="Name, organization, location"
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="space-y-1 text-[11px] font-medium text-slate-400">
                  Location
                  <select
                    value={opportunityLocation}
                    onChange={(event) => setOpportunityLocation(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option>All locations</option>
                    {opportunityLocations.map((location) => <option key={location}>{location}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-[11px] font-medium text-slate-400">
                  Format
                  <select
                    value={opportunityFormat}
                    onChange={(event) => setOpportunityFormat(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="all">Any format</option>
                    <option value="virtual">Virtual</option>
                    <option value="in_person">In person</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </label>
                <label className="space-y-1 text-[11px] font-medium text-slate-400">
                  Category
                  <select
                    value={opportunityCategory}
                    onChange={(event) => setOpportunityCategory(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="all">All categories</option>
                    {['Tech', 'Business', 'Creative', 'Science'].map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-[11px] font-medium text-slate-400">
                  Sort by
                  <select
                    value={opportunitySort}
                    onChange={(event) => setOpportunitySort(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="deadline">Upcoming deadline</option>
                    <option value="location">Location</option>
                    <option value="title">Name</option>
                  </select>
                </label>
              </div>
            )}

            {activeTab === 'admin' && isAdmin && (
              <form id="opportunity-form" onSubmit={handleOpportunitySubmit} className="scroll-mt-36 space-y-4 rounded-2xl border border-indigo-400/20 bg-[#111827] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">
                    {editingOpportunityId ? 'Edit opportunity' : 'Add an opportunity'}
                  </h3>
                  {editingOpportunityId && (
                    <button type="button" onClick={resetOpportunityForm} className="text-xs text-slate-400 hover:text-white">
                      Cancel edit
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-slate-400">
                    Opportunity title
                    <input required value={opportunityForm.title} onChange={(event) => setOpportunityForm({ ...opportunityForm, title: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
                  </label>
                  <label className="space-y-1 text-xs text-slate-400">
                    Organization
                    <input required value={opportunityForm.organization} onChange={(event) => setOpportunityForm({ ...opportunityForm, organization: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
                  </label>
                  <label className="space-y-1 text-xs text-slate-400">
                    Category
                    <select value={opportunityForm.category} onChange={(event) => setOpportunityForm({ ...opportunityForm, category: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500">
                      {['Tech', 'Business', 'Creative', 'Science'].map((category) => <option key={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-slate-400">
                    Deadline
                    <input type="date" value={opportunityForm.deadline} onChange={(event) => setOpportunityForm({ ...opportunityForm, deadline: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
                  </label>
                  <label className="space-y-1 text-xs text-slate-400">
                    Location
                    <input required value={opportunityForm.location} onChange={(event) => setOpportunityForm({ ...opportunityForm, location: event.target.value })} placeholder="Virtual, Ottawa, Canada-wide…" className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
                  </label>
                  <label className="space-y-1 text-xs text-slate-400">
                    Format
                    <select value={opportunityForm.format} onChange={(event) => setOpportunityForm({ ...opportunityForm, format: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500">
                      <option value="virtual">Virtual</option>
                      <option value="in_person">In person</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-slate-400">
                    Award or grant
                    <input value={opportunityForm.grant_amount} onChange={(event) => setOpportunityForm({ ...opportunityForm, grant_amount: event.target.value })} placeholder="e.g. $5,000" className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
                  </label>
                  <label className="space-y-1 text-xs text-slate-400">
                    Application URL
                    <input type="url" value={opportunityForm.apply_url} onChange={(event) => setOpportunityForm({ ...opportunityForm, apply_url: event.target.value })} placeholder="https://" className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
                  </label>
                  <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">
                    Description
                    <textarea required rows={3} value={opportunityForm.description} onChange={(event) => setOpportunityForm({ ...opportunityForm, description: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
                  </label>
                  <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">
                    Requirements
                    <textarea rows={2} value={opportunityForm.requirements} onChange={(event) => setOpportunityForm({ ...opportunityForm, requirements: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
                  </label>
                </div>
                <button disabled={savingOpportunity} type="submit" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">
                  {savingOpportunity ? 'Saving…' : editingOpportunityId ? 'Save changes' : 'Create opportunity'}
                </button>
              </form>
            )}

            <div id="opportunity-list" className="scroll-mt-36 grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredOpportunities.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-700 bg-[#111827]/60 px-5 py-10 text-center">
                  {loadingData ? (
                    <div role="status" aria-live="polite" className="space-y-3">
                      <span className="sr-only">Loading opportunities</span>
                      <div className="mx-auto h-4 w-40 animate-pulse rounded bg-slate-800" />
                      <div className="mx-auto h-3 w-64 max-w-full animate-pulse rounded bg-slate-800/70" />
                    </div>
                  ) : dataErrors.some((message) => message.startsWith('Opportunities:') || message.includes('public.opportunities')) ? (
                    <>
                      <p className="text-sm font-semibold text-amber-100">Opportunities could not be loaded.</p>
                      <p className="mt-1 text-xs text-slate-400">Check the workspace alert above for setup details, then retry after resolving the reported issue.</p>
                    </>
                  ) : opportunities.length ? (
                    <>
                      <p className="text-sm font-semibold text-slate-200">
                        {activeTab === 'admin' && opportunityStatusFilter === 'pending'
                          ? 'The review queue is clear.'
                          : 'No opportunities match those filters.'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {activeTab === 'admin' && opportunityStatusFilter === 'pending'
                          ? 'New feed entries appear here after a successful source sync.'
                          : 'Try another status or clear your search and filters.'}
                      </p>
                      {activeTab === 'opportunities' && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpportunitySearch('');
                            setOpportunityLocation('All locations');
                            setOpportunityCategory('all');
                            setOpportunityFormat('all');
                          }}
                          className="mt-4 rounded-lg border border-teal-800 px-3 py-2 text-xs font-semibold text-teal-200 hover:bg-teal-950/30"
                        >
                          Clear filters
                        </button>
                      )}
                    </>
                  ) : dataErrors.some((message) => message.startsWith('Rankings:')) ? (
                    <>
                      <AlertCircle className="mx-auto h-7 w-7 text-amber-300" aria-hidden="true" />
                      <p className="mt-3 text-sm font-semibold text-slate-200">Rankings could not be loaded.</p>
                      <p className="mt-1 text-xs text-slate-400">Check the workspace alert above for the reported data issue.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-slate-200">No published opportunities yet.</p>
                      <p className="mt-1 text-xs text-slate-400">Check back later, or save a source from the admin workspace for review.</p>
                    </>
                  )}
                </div>
              ) : filteredOpportunities.map((opp) => (
                <div key={opp.id} className="flex min-w-0 flex-col justify-between space-y-4 rounded-2xl border border-slate-800 bg-[#111827] p-4 transition-colors hover:border-teal-800/60 sm:p-5">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase bg-indigo-950 border border-indigo-800 text-indigo-300 px-2.5 py-0.5 rounded-full">
                          {opp.category}
                        </span>
                        {opp.featured && (
                          <span className="rounded-full border border-amber-700/60 bg-amber-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                            Featured
                          </span>
                        )}
                        {opp.archived_at && (
                          <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                            Archived
                          </span>
                        )}
                        {isOpportunityExpired(opp.deadline) && (
                          <span className="rounded-full border border-rose-900/70 bg-rose-950/30 px-2.5 py-0.5 text-[10px] font-bold uppercase text-rose-300">
                            Deadline passed
                          </span>
                        )}
                        {getOpportunityVerificationStatus(opp.last_verified_at) === 'recent' && (
                          <span className="rounded-full border border-emerald-900/70 bg-emerald-950/30 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                            Recently verified
                          </span>
                        )}
                        {getOpportunityVerificationStatus(opp.last_verified_at) === 'stale' && (
                          <span className="rounded-full border border-amber-900/70 bg-amber-950/30 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                            Verification due
                          </span>
                        )}
                        {activeTab === 'admin' && (
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            opp.publishing_status === 'pending'
                              ? 'border border-amber-800/70 bg-amber-950/30 text-amber-300'
                              : opp.publishing_status === 'rejected'
                                ? 'border border-rose-900/70 bg-rose-950/30 text-rose-300'
                                : 'border border-emerald-900/70 bg-emerald-950/30 text-emerald-300'
                          }`}>
                            {opp.publishing_status || 'published'}
                          </span>
                        )}
                        {activeTab === 'admin' && opp.source_id && (
                          <span className="rounded-full border border-sky-900/70 bg-sky-950/30 px-2.5 py-0.5 text-[10px] font-bold uppercase text-sky-300">
                            Feed import
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" /> {opp.deadline ? `Deadline: ${opp.deadline}` : 'No deadline'}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-white text-base">{opp.title}</h3>
                      <p className="text-xs text-indigo-400 font-medium">{opp.organization}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300">
                          {opp.location || (opp.format === 'virtual' ? 'Virtual' : 'Location not specified')}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] capitalize text-slate-300">
                          {(opp.format || 'virtual').replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {opp.description}
                    </p>
                    <p className="text-[10px] leading-4 text-slate-500">
                      {opp.last_verified_at
                        ? `Odyssey last checked this listing ${formatLogDate(opp.last_verified_at)}.`
                        : 'This listing has not yet been verified by an Odyssey admin.'}
                      {' '}Always confirm details on the official application page.
                    </p>
                    {opp.requirements && <p className="text-xs leading-relaxed text-slate-400"><span className="font-semibold text-slate-300">Requirements:</span> {opp.requirements}</p>}

                    {opp.grant_amount && (
                      <div className="bg-[#0B0F19] p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                        <span className="text-slate-400">Award / Grant:</span>
                        <span className="font-bold text-emerald-400 font-mono">{opp.grant_amount}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-stretch gap-2">
                    {activeTab === 'opportunities' && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleOpportunityBookmark(opp)}
                          aria-pressed={opportunityBookmarks.some((bookmark) => bookmark.opportunity_id === opp.id)}
                          className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                            opportunityBookmarks.some((bookmark) => bookmark.opportunity_id === opp.id)
                              ? 'border-amber-700/70 bg-amber-950/30 text-amber-200'
                              : 'border-slate-700 text-slate-300 hover:border-indigo-500 hover:text-white'
                          }`}
                        >
                          {opportunityBookmarks.some((bookmark) => bookmark.opportunity_id === opp.id) ? 'Saved' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openReportForm('opportunity', opp.id)}
                          aria-label={`Report an issue with ${opp.title}`}
                          className="min-h-10 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400 hover:border-rose-800 hover:text-rose-200"
                        >
                          Report issue
                        </button>
                      </>
                    )}
                    {isSafeHttpUrl(opp.apply_url) ? (
                      <a href={opp.apply_url} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 py-2 text-xs font-bold text-slate-200 transition-all hover:bg-indigo-600 hover:text-white">
                        Official application <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="flex flex-1 items-center justify-center rounded-xl bg-slate-900 py-2 text-xs text-slate-500">Application link unavailable</span>
                    )}
                    {activeTab === 'admin' && isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => updateOpportunityPublishing(opp, { last_verified_at: new Date().toISOString() })}
                          className="min-h-10 rounded-xl border border-teal-800 px-3 py-2 text-xs font-semibold text-teal-200 hover:bg-teal-950/40"
                        >
                          Mark verified today
                        </button>
                        {opp.publishing_status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => updateOpportunityPublishing(opp, { publishing_status: 'published' })}
                              className="min-h-10 rounded-xl border border-emerald-800/70 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-950/40"
                            >
                              Approve & publish
                            </button>
                            <button
                              type="button"
                              onClick={() => updateOpportunityPublishing(opp, { publishing_status: 'rejected' })}
                              className="min-h-10 rounded-xl border border-rose-900/70 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-950/40"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {opp.publishing_status === 'rejected' && (
                          <button
                            type="button"
                            onClick={() => updateOpportunityPublishing(opp, { publishing_status: 'pending' })}
                            className="rounded-xl border border-amber-800/70 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-950/40"
                          >
                            Return to review
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => updateOpportunityPublishing(opp, { featured: !opp.featured })}
                          className="rounded-xl border border-amber-800/70 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-950/50"
                        >
                          {opp.featured ? 'Unfeature' : 'Feature'}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateOpportunityPublishing(opp, { archived_at: opp.archived_at ? null : new Date().toISOString() })}
                          className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
                        >
                          {opp.archived_at ? 'Restore' : 'Archive'}
                        </button>
                        <button type="button" onClick={() => handleEditOpportunity(opp)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-indigo-400 hover:text-white">Edit</button>
                        <button type="button" onClick={() => handleDeleteOpportunity(opp)} className="rounded-xl border border-rose-900/70 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/60">Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 3: TECH & CV LAB ================= */}
        {activeTab === 'tech' && (
          <div className="space-y-6">
            <header className="dashboard-page-heading rounded-3xl border border-slate-800 bg-gradient-to-br from-[#151c2c] to-[#101521] p-4 sm:p-8">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div className="max-w-xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    <Cpu className="h-3.5 w-3.5" /> Personal goal tracker
                  </span>
                  <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">Build your next skill.</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Set a target, choose a deadline, and update your progress as you learn.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <a href="#create-goal" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-950/20 transition-colors hover:bg-indigo-500">
                    <Plus className="h-3.5 w-3.5" /> Create a goal
                  </a>
                  <div className="min-w-44 flex-1 rounded-2xl border border-slate-700 bg-[#0B0F19]/80 p-4 sm:flex-none">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Overall progress</span>
                    <span className="font-mono font-bold text-emerald-300">{roadmapStats.pct}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all" style={{ width: `${roadmapStats.pct}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">{roadmapStats.completed} completed · {roadmapStats.active} active</p>
                  </div>
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Total goals', roadmapStats.total, 'text-white'],
                  ['In progress', roadmapStats.active, 'text-indigo-300'],
                  ['Completed', roadmapStats.completed, 'text-emerald-300'],
                  ['Past due', roadmapStats.overdue, roadmapStats.overdue ? 'text-amber-300' : 'text-slate-300'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-xl border border-slate-800 bg-[#0B0F19]/55 p-3">
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </header>

            <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                <div>
                  <h3 className="text-sm font-bold text-white">This week at a glance</h3>
                  <p className="mt-1 text-xs text-slate-500">A personal review of your momentum so far.</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ['Updates', weeklyInsights.posts],
                    ['Goals done', weeklyInsights.completedGoals],
                    ['Active days', weeklyInsights.activeDays],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-800 bg-[#0B0F19]/70 p-3">
                      <p className="text-lg font-bold text-white">{value}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] leading-5 text-slate-400">
                  {weeklyInsights.posts === 0 && weeklyInsights.completedGoals === 0
                    ? 'Every week is a fresh start. Choose one small step to begin.'
                    : `You shared ${weeklyInsights.posts} update${weeklyInsights.posts === 1 ? '' : 's'} across ${weeklyInsights.activeDays} active day${weeklyInsights.activeDays === 1 ? '' : 's'} this week.`}
                </p>
              </div>
              <form onSubmit={saveWeeklyReview} className="space-y-3 rounded-2xl border border-slate-800 bg-[#111827] p-5">
                <div>
                  <h3 className="text-sm font-bold text-white">Weekly review</h3>
                  <p className="mt-1 text-xs text-slate-500">Reflect on what went well and choose a focus for next.</p>
                </div>
                <label className="block text-[11px] text-slate-400">
                  My focus this week
                  <input
                    value={weeklyReview.focus}
                    onChange={(event) => setWeeklyReview((previous) => ({ ...previous, focus: event.target.value }))}
                    maxLength={200}
                    placeholder="One thing I want to make progress on…"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-xs text-slate-200"
                  />
                </label>
                <label className="block text-[11px] text-slate-400">
                  Reflection
                  <textarea
                    value={weeklyReview.reflection}
                    onChange={(event) => setWeeklyReview((previous) => ({ ...previous, reflection: event.target.value }))}
                    maxLength={1000}
                    rows={3}
                    placeholder="What felt good? What would you like to try differently?"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-xs text-slate-200"
                  />
                </label>
                <button disabled={savingWeeklyReview} type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-[11px] font-bold text-white hover:bg-indigo-500 disabled:opacity-50">
                  {savingWeeklyReview ? 'Saving…' : 'Save weekly review'}
                </button>
              </form>
            </section>

            <form id="create-goal" onSubmit={addCustomMilestone} className="scroll-mt-36 space-y-4 rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-5">
              <div>
                <h3 className="text-sm font-bold text-white">Create a goal</h3>
                <p className="mt-1 text-xs text-slate-500">Make it specific and achievable.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-[11px] text-slate-400 sm:col-span-2">
                  Goal
                  <input
                    id="goal-title"
                    required
                    maxLength={120}
                    value={newMilestoneTitle}
                    onChange={(event) => setNewMilestoneTitle(event.target.value)}
                    placeholder="e.g. Build a REST API with Python"
                    className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="space-y-1 text-[11px] text-slate-400">
                  Skill area
                  <select value={newMilestoneCat} onChange={(event) => setNewMilestoneCat(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-slate-200">
                    {['Programming', 'Web development', 'Backend', 'AI / machine learning', 'Data science', 'Systems', 'Core CS', 'Computer vision', 'Other'].map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-[11px] text-slate-400">
                  Target date
                  <input type="date" value={newMilestoneDueDate} onChange={(event) => setNewMilestoneDueDate(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-slate-200" />
                </label>
                <label className="space-y-1 text-[11px] text-slate-400 sm:col-span-2">
                  Notes
                  <textarea value={newMilestoneNotes} onChange={(event) => setNewMilestoneNotes(event.target.value)} maxLength={1000} rows={2} placeholder="Why does this goal matter? What will success look like?" className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-xs text-slate-200" />
                </label>
                <label className="space-y-1 text-[11px] text-slate-400 sm:col-span-2">
                  Learning resource (optional)
                  <input type="url" value={newMilestoneResource} onChange={(event) => setNewMilestoneResource(event.target.value)} placeholder="https://docs.example.com" className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-xs text-slate-200" />
                </label>
                <label className="space-y-1 text-[11px] text-slate-400 sm:col-span-3">
                  Checklist (one step per line)
                  <textarea value={newMilestoneChecklist} onChange={(event) => setNewMilestoneChecklist(event.target.value)} maxLength={1000} rows={3} placeholder={'Read the API documentation\nBuild a small prototype\nWrite a short project summary'} className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-xs text-slate-200" />
                </label>
                <label className="space-y-1 text-[11px] text-slate-400">
                  Priority
                  <select value={newMilestonePriority} onChange={(event) => setNewMilestonePriority(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3 py-2.5 text-sm text-slate-200">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button disabled={savingTechGoals} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60">
                    <Plus className="h-4 w-4" /> {savingTechGoals ? 'Saving…' : 'Add goal'}
                  </button>
                </div>
              </div>
            </form>

            <section className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-bold text-white">Your goals</h3>
                  <p className="mt-1 text-xs text-slate-500">Update progress whenever you make a step forward.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['all', 'All goals'],
                    ['active', 'In progress'],
                    ['overdue', 'Past due'],
                    ['completed', 'Completed'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTechGoalFilter(value)}
                      aria-pressed={techGoalFilter === value}
                      className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${
                        techGoalFilter === value
                          ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                          : 'border-slate-800 bg-[#111827] text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTechGoals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-[#111827]/60 px-5 py-10 text-center">
                  {loadingData ? (
                    <div role="status" aria-live="polite" className="space-y-3">
                      <span className="sr-only">Loading your goals</span>
                      <div className="mx-auto h-8 w-8 animate-pulse rounded-lg bg-slate-800" />
                      <div className="mx-auto h-4 w-48 max-w-full animate-pulse rounded bg-slate-800" />
                      <div className="mx-auto h-3 w-64 max-w-full animate-pulse rounded bg-slate-800/70" />
                    </div>
                  ) : (
                    <>
                      <Cpu className="mx-auto h-8 w-8 text-slate-600" />
                      <p className="mt-3 text-sm font-semibold text-slate-200">
                        {customMilestones.length ? 'No goals in this view.' : 'Your next skill starts with one goal.'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {customMilestones.length ? 'Choose another filter to see your goals.' : 'Add a specific target above to begin tracking your progress.'}
                      </p>
                      {!customMilestones.length && (
                        <a href="#goal-title" className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-teal-800 px-3 py-2 text-xs font-semibold text-teal-200 hover:bg-teal-950/30">
                          Create your first goal <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {filteredTechGoals.map((goal) => {
                    const progress = Math.max(0, Math.min(100, goal.progress ?? (goal.completed ? 100 : 0)));
                    const isOverdue = !goal.completed && goal.dueDate && goal.dueDate < new Date().toISOString().slice(0, 10);
                    return (
                      <article key={goal.id} className={`rounded-2xl border bg-[#111827] p-5 transition-colors ${goal.completed ? 'border-emerald-900/60' : 'border-slate-800'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-indigo-800/60 bg-indigo-950/50 px-2.5 py-1 text-[10px] font-bold text-indigo-300">{goal.category || 'Other'}</span>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${
                                goal.priority === 'high' ? 'bg-rose-950/50 text-rose-300'
                                  : goal.priority === 'low' ? 'bg-slate-800 text-slate-300'
                                    : 'bg-amber-950/40 text-amber-300'
                              }`}>{goal.priority || 'medium'} priority</span>
                            </div>
                            <h4 className={`mt-3 text-sm font-bold leading-5 ${goal.completed ? 'text-slate-400 line-through' : 'text-white'}`}>{goal.title}</h4>
                            {goal.notes && <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-400">{goal.notes}</p>}
                            {isSafeHttpUrl(goal.resourceUrl) && (
                              <a href={goal.resourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-300 hover:text-indigo-200">
                                <ExternalLink className="h-3 w-3" /> Open learning resource
                              </a>
                            )}
                            <p className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${isOverdue ? 'text-amber-300' : 'text-slate-500'}`}>
                              <Clock className="h-3.5 w-3.5" />
                              {goal.dueDate ? `${isOverdue ? 'Past due · ' : 'Target · '}${new Date(`${goal.dueDate}T00:00:00`).toLocaleDateString()}` : 'No target date'}
                            </p>
                          </div>
                          <button type="button" onClick={() => deleteMilestone(goal.id)} disabled={savingTechGoals} aria-label={`Delete goal ${goal.title}`} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {(goal.checklist || []).length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Checklist · {(goal.checklist || []).filter((item) => item.completed).length}/{goal.checklist.length}
                            </p>
                            {goal.checklist.map((item) => (
                              <label key={item.id} className="flex cursor-pointer items-start gap-2 text-xs text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={Boolean(item.completed)}
                                  disabled={savingTechGoals}
                                  onChange={() => toggleGoalChecklistItem(goal.id, item.id)}
                                  className="mt-0.5 accent-teal-400"
                                />
                                <span className={item.completed ? 'text-slate-500 line-through' : ''}>{item.text}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        <div className="mt-5">
                          <div className="flex items-center justify-between text-[11px]">
                            <label htmlFor={`goal-progress-${goal.id}`} className="font-semibold text-slate-400">Progress</label>
                            <span className={`font-mono font-bold ${goal.completed ? 'text-emerald-300' : 'text-indigo-300'}`}>{progress}%</span>
                          </div>
                          <input
                            id={`goal-progress-${goal.id}`}
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={progress}
                            disabled={savingTechGoals}
                            onChange={(event) => {
                              const progressValue = Number(event.target.value);
                              setCustomMilestones((previous) => previous.map((item) => item.id === goal.id
                                ? { ...item, progress: progressValue, completed: progressValue === 100 }
                                : item));
                            }}
                            onPointerUp={(event) => updateTechGoal(goal.id, { progress: Number(event.currentTarget.value) })}
                            onKeyUp={(event) => updateTechGoal(goal.id, { progress: Number(event.currentTarget.value) })}
                            className="mt-2 w-full accent-indigo-500 disabled:opacity-50"
                          />
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                              <div className={`h-full rounded-full transition-all ${goal.completed ? 'bg-emerald-400' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }} />
                            </div>
                            <button
                              type="button"
                              disabled={savingTechGoals}
                              onClick={() => updateTechGoal(goal.id, { completed: !goal.completed })}
                              className={`shrink-0 rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                                goal.completed
                                  ? 'border-slate-700 text-slate-400 hover:text-white'
                                  : 'border-emerald-800/70 text-emerald-300 hover:bg-emerald-950/40'
                              }`}
                            >
                              {goal.completed ? 'Reopen goal' : 'Mark complete'}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================= TAB 4: RANKINGS ================= */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            <div className="dashboard-page-heading flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="space-y-1">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-emerald-400" /> Student Streak Rankings
              </h2>
              <p className="text-xs text-slate-400">Rankings computed directly from active daily update consistency.</p>
              </div>
              <button type="button" onClick={() => setActiveTab('tech')} className="inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 sm:self-auto">
                Set a goal <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="bg-[#111827] rounded-2xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
              {publicLeaderboard.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  {loadingData ? (
                    <div role="status" aria-live="polite" className="space-y-3">
                      <span className="sr-only">Loading rankings</span>
                      <div className="mx-auto h-4 w-40 animate-pulse rounded bg-slate-800" />
                      <div className="mx-auto h-3 w-56 max-w-full animate-pulse rounded bg-slate-800/70" />
                    </div>
                  ) : (
                    <>
                      <Trophy className="mx-auto h-7 w-7 text-slate-600" aria-hidden="true" />
                      <p className="mt-3 text-sm font-semibold text-slate-200">Rankings will grow with the community.</p>
                      <p className="mt-1 text-xs text-slate-400">Share a learning update to start building your own momentum.</p>
                      <button type="button" onClick={() => setActiveTab('feed')} className="mt-4 rounded-lg border border-teal-800 px-3 py-2 text-xs font-semibold text-teal-200 hover:bg-teal-950/30">
                        Share an update
                      </button>
                    </>
                  )}
                </div>
              ) : (
                publicLeaderboard.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setViewingProfileGoals([]);
                      setViewingProfile(p);
                    }}
                    aria-label={`View ${p.full_name || 'student'}'s profile`}
                    aria-haspopup="dialog"
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-800/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 font-mono font-bold text-xs text-slate-500">#{idx + 1}</span>
                      <ProfileAvatar
                        src={p.avatar_url}
                        name={p.full_name}
                        className="h-8 w-8 rounded-lg"
                      />
                      <div>
                        <h4 className="font-bold text-slate-200 text-xs">{p.full_name || 'Anonymous Student'}</h4>
                        <p className="flex items-center gap-1 text-[10px] text-slate-400">
                          {p.category || 'Student builder'}
                          {p.location && <><span aria-hidden="true">·</span><MapPin className="h-3 w-3" />{p.location}</>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold text-xs bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded-full">
                      <Flame className="w-3.5 h-3.5 fill-emerald-400" />
                      {p.current_streak ?? 0}d Streak
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 5: ANALYTICS ================= */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="dashboard-page-heading flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-indigo-400" /> Momentum Analytics
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">A snapshot of community activity, your consistency, and the focus areas being explored.</p>
              </div>
              <button type="button" onClick={() => setActiveTab('tech')} className="inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 sm:self-auto">
                Review your goals <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {loadingData ? (
              <section role="status" aria-live="polite" className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                <span className="sr-only">Loading analytics</span>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-800/70" />)}
                </div>
              </section>
            ) : activityStats.totalPosts === 0 ? (
              <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-700 bg-[#111827]/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Your activity insights will appear here.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Post a learning update to begin building your personal activity history.</p>
                </div>
                <button type="button" onClick={() => setActiveTab('feed')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-teal-800 px-4 py-2.5 text-xs font-semibold text-teal-200 hover:bg-teal-950/30">
                  Share an update <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </section>
            ) : null}

            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${loadingData ? 'hidden' : ''}`}>
              <div className="bg-[#111827] p-5 rounded-2xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Live wall updates</span>
                <div className="text-2xl font-bold text-white font-mono">{activityStats.totalPosts}</div>
                <p className="text-[11px] text-slate-400">Recent community milestones</p>
              </div>

              <div className="bg-[#111827] p-5 rounded-2xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Your active streak</span>
                <div className="text-2xl font-bold text-emerald-400 font-mono">{profile.current_streak} Days</div>
                <p className="text-[11px] text-slate-400">Current active consistency</p>
              </div>

              <div className="bg-[#111827] p-5 rounded-2xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Daily Commitment Goal</span>
                <div className="text-2xl font-bold text-indigo-400 font-mono">{profile.daily_goal_hours} Hours</div>
                <p className="text-[11px] text-slate-400">Dedicated study & engineering target</p>
              </div>
            </div>

            <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${loadingData ? 'hidden' : ''}`}>
              <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Recent posting activity</h3>
                    <p className="mt-1 text-xs text-slate-400">Seven days ending with the latest community update</p>
                  </div>
                  <span className="rounded-lg border border-indigo-400/15 bg-indigo-400/10 px-2.5 py-1 text-xs font-semibold text-indigo-200">
                    {activityStats.activeDays} active days
                  </span>
                </div>
                <div className="flex h-36 items-end justify-between gap-2" role="img" aria-label="Post activity across the seven days ending with the latest community update">
                  {activityStats.days.map((day, index) => (
                    <div key={`${day.label}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[10px] font-medium text-slate-400">{day.count || ''}</span>
                      <div className="flex h-24 w-full items-end rounded-lg bg-slate-900/80 p-1">
                        <div
                          className={`w-full rounded-md transition-all ${day.count ? 'bg-gradient-to-t from-indigo-600 to-indigo-400' : 'bg-slate-800'}`}
                          style={{ height: `${day.count ? Math.max(12, (day.count / activityStats.maxDailyCount) * 100) : 7}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">{day.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                <div className="mb-5">
                  <h3 className="text-sm font-bold text-white">Community focus</h3>
                  <p className="mt-1 text-xs text-slate-400">How recent updates break down by domain</p>
                </div>
                <div className="space-y-4">
                  {activityStats.categories.map((item, index) => {
                    const percentage = activityStats.totalPosts ? Math.round((item.count / activityStats.totalPosts) * 100) : 0;
                    const barColors = ['bg-indigo-400', 'bg-emerald-400', 'bg-amber-400', 'bg-sky-400'];

                    return (
                      <div key={item.category} className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-300">{item.category}</span>
                          <span className="text-slate-400">{item.count} updates · {percentage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                          <div
                            className={`h-full rounded-full transition-all ${barColors[index]}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ================= TAB 6: SETTINGS ================= */}
        {activeTab === 'profile' && (
          <div className="space-y-6 rounded-2xl border border-slate-800 bg-[#111827] p-4 sm:p-6">
          <div className="dashboard-page-heading flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" /> Account & Profile Settings
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Configure your public profile and focus areas.</p>
            </div>
            <button
              type="submit"
              form="profile-settings-form"
              disabled={savingProfile || uploadingAvatar}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </div>

          <form id="profile-settings-form" onSubmit={handleSaveProfile} className="w-full max-w-2xl space-y-4">
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0B0F19]/70 p-4 sm:flex-row sm:items-center">
                <ProfileAvatar
                  src={profile.avatar_url}
                  name={profile.full_name}
                  className="h-20 w-20 rounded-2xl border-indigo-400/20 bg-indigo-400/10 text-2xl text-indigo-200"
                />
                <div className="space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Profile picture</h3>
                    <p className="mt-1 text-xs text-slate-400">Use a JPG, PNG, or WebP image up to 5 MB.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-indigo-400 hover:text-white">
                      <Camera className="h-3.5 w-3.5" />
                      {uploadingAvatar ? 'Uploading…' : 'Upload photo'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={uploadingAvatar}
                        onChange={handleAvatarUpload}
                      />
                    </label>
                    {profile.avatar_url && (
                      <button
                        type="button"
                        onClick={() => setProfile((previous) => ({ ...previous, avatar_url: '' }))}
                        className="rounded-lg px-3 py-2 text-xs text-slate-400 transition-colors hover:text-rose-300"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="profile-full-name" className="text-xs font-bold text-slate-300">Display name</label>
                <input
                  id="profile-full-name"
                  type="text"
                  maxLength={80}
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="How should the community know you?"
                  className="w-full rounded-xl border border-slate-800 bg-[#0B0F19] p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="profile-category" className="text-xs font-bold text-slate-300">Primary interest</label>
                  <select
                    id="profile-category"
                    value={profile.category}
                    onChange={(e) => setProfile({ ...profile, category: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-[#0B0F19] p-3 text-sm font-bold text-indigo-300"
                  >
                    <option value="Tech">Tech</option>
                    <option value="Business">Business</option>
                    <option value="Creative">Creative</option>
                    <option value="Science">Science</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="profile-location" className="text-xs font-bold text-slate-300">Location</label>
                  <input
                    id="profile-location"
                    type="text"
                    maxLength={100}
                    value={profile.location}
                    onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                    placeholder="City, region, or remote"
                    className="w-full rounded-xl border border-slate-800 bg-[#0B0F19] p-3 text-sm text-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="profile-bio" className="text-xs font-bold text-slate-300">About you</label>
                  <span className="text-[10px] text-slate-500">{profile.bio.length}/500</span>
                </div>
                <textarea
                  id="profile-bio"
                  maxLength={500}
                  rows={3}
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="Share what you are learning, building, or hoping to explore."
                  className="w-full rounded-xl border border-slate-800 bg-[#0B0F19] p-3 text-sm leading-6 text-slate-200"
                />
              </div>

              <section className="space-y-4 rounded-2xl border border-slate-800 bg-[#0B0F19]/70 p-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-200">Privacy & reminders</h3>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    These controls affect what other students can see in Odyssey. Your private data remains available to you and authorized administrators. Goal visibility only affects your profile.
                  </p>
                </div>
                <div className="space-y-3">
                  {[
                    ['is_profile_public', 'Show my profile in Rankings and community'],
                    ['activity_public', 'Show my Live Wall activity'],
                    ['goals_public', 'Show my Goal Tracker goals on my profile'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2.5 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(profile[key])}
                        onChange={(event) => setProfile((previous) => ({ ...previous, [key]: event.target.checked }))}
                        className="mt-0.5 accent-teal-400"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="border-t border-slate-800 pt-3">
                  <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(profile.reminder_settings?.enabled)}
                      onChange={(event) => setProfile((previous) => ({
                        ...previous,
                        reminder_settings: { ...previous.reminder_settings, enabled: event.target.checked },
                      }))}
                      className="mt-0.5 accent-teal-400"
                    />
                    Enable browser reminders
                  </label>
                  <div className="ml-6 mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="flex items-center gap-2 text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        disabled={!profile.reminder_settings?.enabled}
                        checked={Boolean(profile.reminder_settings?.daily)}
                        onChange={(event) => setProfile((previous) => ({
                          ...previous,
                          reminder_settings: { ...previous.reminder_settings, daily: event.target.checked },
                        }))}
                        className="accent-teal-400"
                      />
                      Daily check-in
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        disabled={!profile.reminder_settings?.enabled}
                        checked={Boolean(profile.reminder_settings?.weekly)}
                        onChange={(event) => setProfile((previous) => ({
                          ...previous,
                          reminder_settings: { ...previous.reminder_settings, weekly: event.target.checked },
                        }))}
                        className="accent-teal-400"
                      />
                      Weekly review
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-400">
                      Reminder time
                      <select
                        disabled={!profile.reminder_settings?.enabled}
                        value={profile.reminder_settings?.hour ?? 18}
                        onChange={(event) => setProfile((previous) => ({
                          ...previous,
                          reminder_settings: { ...previous.reminder_settings, hour: Number(event.target.value) },
                        }))}
                        className="rounded-lg border border-slate-700 bg-[#111827] px-2 py-1.5 text-xs text-slate-200"
                      >
                        {[8, 9, 10, 12, 15, 17, 18, 19, 20, 21].map((hour) => (
                          <option key={hour} value={hour}>{new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric' })}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="ml-6 mt-2 text-[10px] leading-4 text-slate-500">Browser reminders work only while Odyssey is open in this browser and notification permission is allowed.</p>
                </div>
              </section>

              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#0B0F19]/70 p-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-200">Links</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Add a website or social profile to your public student profile.</p>
                </div>
                {[
                  { id: 'website_url', label: 'Website', icon: Globe, placeholder: 'https://your-site.com' },
                  { id: 'github', label: 'GitHub', icon: ExternalLink, placeholder: 'https://github.com/username' },
                  { id: 'linkedin', label: 'LinkedIn', icon: ExternalLink, placeholder: 'https://linkedin.com/in/username' },
                  { id: 'portfolio', label: 'Portfolio', icon: Layers, placeholder: 'https://your-portfolio.com' },
                ].map((link) => {
                  const Icon = link.icon;
                  return (
                    <label key={link.id} htmlFor={`profile-${link.id}`} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                      <span className="sr-only">{link.label}</span>
                      <input
                        id={`profile-${link.id}`}
                        type="url"
                        inputMode="url"
                        value={profile[link.id]}
                        onChange={(e) => setProfile({ ...profile, [link.id]: e.target.value })}
                        placeholder={link.placeholder}
                        className="w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Daily Goal Hours ({profile.daily_goal_hours}h)</label>
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={profile.daily_goal_hours}
                  onChange={(e) => setProfile({ ...profile, daily_goal_hours: parseInt(e.target.value) })}
                  className="w-full accent-indigo-500"
                />
              </div>

            </form>
          </div>
        )}

      </div>

      {viewingProfile && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setViewingProfile(null);
              setViewingProfileGoals([]);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="viewing-profile-name"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-[#111827] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <ProfileAvatar
                  src={viewingProfile.avatar_url}
                  name={viewingProfile.full_name}
                  className="h-16 w-16 rounded-2xl"
                />
                <div className="min-w-0">
                  <h2 id="viewing-profile-name" className="truncate text-lg font-bold text-white">
                    {viewingProfile.full_name || 'Anonymous Student'}
                  </h2>
                  <p className="mt-1 text-sm text-indigo-300">
                    {viewingProfile.category || 'Student builder'}
                  </p>
                  {viewingProfile.location && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                      <MapPin className="h-3.5 w-3.5" /> {viewingProfile.location}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewingProfile(null);
                  setViewingProfileGoals([]);
                }}
                aria-label="Close profile"
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-300">
                <Flame className="h-4 w-4" />
                {viewingProfile.current_streak ?? 0} day momentum streak
              </div>

              {viewingProfile.bio && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">About</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{viewingProfile.bio}</p>
                </div>
              )}

              {(viewingProfile.goals_public || viewingProfile.id === user?.id) && viewingProfileGoals.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Shared goals</h3>
                  <div className="mt-2 space-y-2">
                    {viewingProfileGoals.slice(0, 5).map((goal) => (
                      <div key={goal.id} className="rounded-xl border border-slate-800 bg-[#0B0F19] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-200">{goal.title}</span>
                          <span className="text-[10px] font-mono text-indigo-300">{goal.progress ?? (goal.completed ? 100 : 0)}%</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(0, Math.min(100, goal.progress ?? (goal.completed ? 100 : 0)))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {[
                ['Website', viewingProfile.website_url],
                ['GitHub', viewingProfile.github],
                ['LinkedIn', viewingProfile.linkedin],
                ['Portfolio', viewingProfile.portfolio],
              ].filter(([, url]) => normalizeHttpUrl(url)).length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Links</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      ['Website', viewingProfile.website_url],
                      ['GitHub', viewingProfile.github],
                      ['LinkedIn', viewingProfile.linkedin],
                      ['Portfolio', viewingProfile.portfolio],
                    ].filter(([, url]) => normalizeHttpUrl(url)).map(([label, url]) => (
                      <a
                        key={label}
                        href={normalizeHttpUrl(url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-indigo-300 transition-colors hover:border-indigo-500 hover:text-indigo-200"
                      >
                        {label} <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Recent milestones</h3>
                <div className="mt-2 space-y-2">
                  {(viewingProfile.id === user?.id || viewingProfile.activity_public !== false) && logs.filter((log) => log.user_id === viewingProfile.id).slice(0, 3).length > 0 ? (
                    logs.filter((log) => log.user_id === viewingProfile.id).slice(0, 3).map((log) => (
                      <article key={log.id} className="rounded-xl border border-slate-800 bg-[#0B0F19] p-3">
                        <p className="text-sm leading-5 text-slate-200">{log.content}</p>
                        <p className="mt-2 text-[11px] text-slate-500">
                          {log.category || 'Milestone'} · {formatLogDate(log.created_at)}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-800 px-3 py-4 text-xs text-slate-500">
                      No recent public milestones.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {reportTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submittingReport) setReportTarget(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-report-heading"
            className="w-full max-w-lg rounded-t-2xl border border-slate-700 bg-[#111827] p-5 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="community-report-heading" className="text-sm font-bold text-white">
                  Report {reportTarget.targetType === 'daily_log' ? 'a Live Wall post' : reportTarget.targetType === 'member' ? 'a member or conversation' : 'an opportunity'}
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">Reports are private and reviewed by Odyssey moderators.</p>
              </div>
              <button
                type="button"
                disabled={submittingReport}
                onClick={() => setReportTarget(null)}
                aria-label="Close report form"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitCommunityReport} className="mt-4 space-y-3">
              <label className="block space-y-1 text-xs text-slate-300">
                Reason
                <select
                  autoFocus
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-sm text-white"
                >
                  {reportTarget.targetType === 'daily_log' || reportTarget.targetType === 'member' ? (
                    <>
                      <option value="harassment">Harassment or harmful content</option>
                      <option value="spam">Spam or misleading content</option>
                      <option value="personal_information">Personal information shared</option>
                      {reportTarget.targetType === 'member' && <option value="message_safety">Unsafe or inappropriate messages</option>}
                      <option value="other">Other community concern</option>
                    </>
                  ) : (
                    <>
                      <option value="broken_link">Broken application link</option>
                      <option value="incorrect_deadline">Incorrect deadline</option>
                      <option value="closed_opportunity">Closed or outdated opportunity</option>
                      <option value="other">Other listing issue</option>
                    </>
                  )}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-slate-300">
                Details (optional)
                <textarea
                  rows={3}
                  maxLength={500}
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value)}
                  placeholder="Share enough detail for the moderation team to review."
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F19] px-3 py-2 text-sm text-white"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={submittingReport}
                  onClick={() => setReportTarget(null)}
                  className="min-h-11 rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="min-h-11 rounded-lg bg-rose-800 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {submittingReport ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* GLOBAL TOAST NOTICE */}
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
    </div>
  );
}