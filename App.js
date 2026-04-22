import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Image, FlatList, Modal, SafeAreaView,
  Animated, Dimensions, StatusBar, Platform, Share, RefreshControl
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { io } from 'socket.io-client';
import { LinearGradient } from 'expo-linear-gradient';

const Stack = createNativeStackNavigator();
const { width: SCREEN_W } = Dimensions.get('window');

// ── JWT Fetch Interceptor ──
const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  if (typeof url === 'string' && url.includes('172.18.12.100') && global.jwtToken) {
    options.headers = {
      ...(options.headers || {}),
      'Authorization': 'Bearer ' + global.jwtToken
    };
  }
  return originalFetch(url, options);
};

// ─── Design Tokens — Light Lavender/Purple Theme ─────────────────────
const C = {
  // Backgrounds
  bg: '#F5F3FF',       // lavender page bg
  bgCard: '#FFFFFF',       // pure white cards
  bgSection: '#EDE9FE',       // soft lavender section bg
  bgInput: '#F5F3FF',       // input bg
  bgTag: '#EDE9FE',       // pill/tag bg

  // Purple scale
  purple: '#7C3AED',       // primary CTA
  purpleLight: '#8B5CF6',       // hover/secondary
  purplePale: '#DDD6FE',       // soft fill
  purpleDark: '#5B21B6',       // text on light

  // Accent
  accent: '#F59E0B',       // orange/amber badge (ENDING SOON, etc.)
  accentGreen: '#10B981',
  accentRed: '#EF4444',
  accentBlue: '#3B82F6',

  // Text
  text: '#1E1B4B',       // near-black (indigo-950)
  textSub: '#6B7280',       // gray-500
  textMuted: '#9CA3AF',       // gray-400
  textOnPurple: '#FFFFFF',

  // Borders
  border: '#E9E5F8',       // lavender border
  borderMid: '#C4B5FD',       // medium purple border
  shadow: 'rgba(124,58,237,0.10)',
};

const GRAD_PURPLE = ['#7C3AED', '#9333EA'];
const GRAD_HERO = ['#7C3AED', '#5B21B6'];
const GRAD_AMBER = ['#F59E0B', '#EF4444'];
const GRAD_GREEN = ['#10B981', '#059669'];
const GRAD_CARD_BG = ['#EDE9FE', '#F5F3FF'];

// ─── Category Config ──────────────────────────────────────────────────
const CATEGORIES = [
  { label: 'All', icon: '✦', color: C.purple },
  { label: 'General', icon: '🎯', color: '#7C3AED' },
  { label: 'Tech', icon: '💻', color: '#3B82F6' },
  { label: 'Arts', icon: '🎨', color: '#EC4899' },
  { label: 'Sports', icon: '⚡', color: '#F59E0B' },
  { label: 'Party', icon: '🔥', color: '#EF4444' },
  { label: 'Workshop', icon: '🛠', color: '#10B981' },
];

// ─── Badge Definitions ────────────────────────────────────────────────
const BADGE_DEFS = [
  { id: 'first_event', icon: '🎯', name: 'First step', desc: 'Attended your first event', check: (t) => t.filter(x => x.attended === 1).length >= 1 },
  { id: 'streak_5', icon: '⚡', name: '5-streak', desc: 'Attended 5 events', check: (t) => t.filter(x => x.attended === 1).length >= 5 },
  { id: 'streak_10', icon: '🌟', name: '10 events', desc: 'Attended 10 events total', check: (t) => t.filter(x => x.attended === 1).length >= 10 },
  { id: 'tech_head', icon: '💻', name: 'Tech head', desc: 'Attended 3 Tech events', check: (t) => t.filter(x => x.attended === 1 && x.category === 'Tech').length >= 3 },
  { id: 'early_bird', icon: '🚀', name: 'Early bird', desc: 'Registered within 1hr', check: (t) => t.some(x => x.early_bird === true) },
  { id: 'all_cats', icon: '🎪', name: 'Explorer', desc: 'Attended 4+ categories', check: (t) => new Set(t.filter(x => x.attended === 1).map(x => x.category)).size >= 4 },
  { id: 'gold_tier', icon: '🏆', name: 'Gold tier', desc: 'Attended 8 events', check: (t) => t.filter(x => x.attended === 1).length >= 8 },
  { id: 'legend', icon: '👑', name: 'Legend', desc: 'Attended 15 events', check: (t) => t.filter(x => x.attended === 1).length >= 15 },
];

function computeStreak(tickets) {
  return tickets.filter(t => t.attended === 1).length;
}

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────

// Clean white card with soft shadow
const Card = ({ children, style, onPress }) => {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap activeOpacity={0.92} onPress={onPress}
      style={[styles.card, style]}>
      {children}
    </Wrap>
  );
};

// Purple gradient CTA button
const PurpleButton = ({ label, onPress, disabled, icon, style, outline }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.97, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onPress && onPress();
  };
  if (outline) {
    return (
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        <TouchableOpacity onPress={press} disabled={disabled} activeOpacity={0.85}
          style={styles.outlineBtn}>
          {icon ? <Text style={{ fontSize: 16, marginRight: 6 }}>{icon}</Text> : null}
          <Text style={styles.outlineBtnText}>{disabled ? 'Please wait…' : label}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity onPress={press} disabled={disabled} activeOpacity={0.85}>
        <LinearGradient colors={GRAD_PURPLE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.purpleBtn}>
          {icon ? <Text style={{ fontSize: 16, marginRight: 6 }}>{icon}</Text> : null}
          <Text style={styles.purpleBtnText}>{disabled ? 'Please wait…' : label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Light input
const LightInput = ({ style, ...props }) => (
  <TextInput
    placeholderTextColor={C.textMuted}
    style={[styles.lightInput, style]}
    {...props}
  />
);

// Category filter pill
const FilterPill = ({ label, active, onPress, color }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8}
    style={[styles.filterPill, active && { backgroundColor: color || C.purple, borderColor: color || C.purple }]}>
    <Text style={[styles.filterPillText, active && { color: '#FFF' }]}>{label}</Text>
  </TouchableOpacity>
);

// Bottom nav bar
const BottomNav = ({ tabs, active, onChange }) => (
  <View style={styles.bottomNav}>
    {tabs.map(t => {
      const isActive = active === t.key;
      return (
        <TouchableOpacity key={t.key} onPress={() => onChange(t.key)}
          style={styles.navItem} activeOpacity={0.7}>
          <View style={[styles.navIconWrap, isActive && styles.navIconActive]}>
            <Text style={[styles.navIcon, isActive && styles.navIconActiveText]}>{t.icon}</Text>
            {t.badge ? (
              <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>{t.badge > 9 ? '9+' : t.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{t.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// Initials avatar
const Avatar = ({ name = '', size = 40, fontSize = 15 }) => {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <LinearGradient colors={GRAD_PURPLE} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: '#FFF', fontSize, fontWeight: '700' }}>{initials}</Text>
    </LinearGradient>
  );
};

// Section header
const SectionHeader = ({ title, action, onAction }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action ? <TouchableOpacity onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity> : null}
  </View>
);

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────
function LoginScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('student');
  const [phone, setPhone] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubRole, setClubRole] = useState('');
  const [department, setDepartment] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studyYear, setStudyYear] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const API_URL = 'http://172.18.12.100:3000/api';

  const CLUB_ROLES = ['President', 'Vice President', 'Coordinator', 'Core Member'];
  const DEPARTMENTS = ['Computer Science', 'Mechanical', 'Electronics', 'Business', 'Arts'];
  const STUDY_YEARS = ['1st Year', '2nd Year', '3rd Year', 'Final Year'];
  const CLUB_NAMES = ['Tech Society', 'E-Sports', 'Robotics', 'Debate', 'Music Club'];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleAuthentication = async () => {
    if (!email || !password || (!isLoginMode && !name)) {
      Alert.alert('Hold on!', 'Please fill out all basic fields.'); return;
    }
    if (!isLoginMode && password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match!'); return;
    }
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}${isLoginMode ? '/login' : '/signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isLoginMode
            ? { email, password }
            : { name, email, password, role, phone, club_name: clubName, club_role: clubRole, department, student_id: studentId, study_year: studyYear }
        ),
      });
      const data = await r.json();
      if (data.success) {
        if (data.token) global.jwtToken = data.token;
        if (isLoginMode) {
          const dest = data.user.role === 'student' ? 'Student' : data.user.role === 'admin' ? 'Admin' : 'Organizer';
          navigation.replace(dest, { userName: data.user.name, userId: data.user.id });
        } else {
          Alert.alert('Account created! ✨', data.message);
          setIsLoginMode(true);
        }
      } else {
        Alert.alert('Oops!', data.message || 'Something went wrong.');
      }
    } catch (e) {
      Alert.alert('Error', 'Server unreachable');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center', width: '100%' }}>

          {/* Logo mark */}
          <LinearGradient colors={GRAD_HERO} style={styles.logoMark}>
            <Text style={{ fontSize: 32 }}>🎪</Text>
          </LinearGradient>
          <Text style={styles.appName}>ClubCascade</Text>
          <Text style={styles.appTagline}>Your college event universe</Text>

          {/* Form card */}
          <Card style={{ width: '100%', marginTop: 28 }}>
            <Text style={styles.formHeading}>
              {isLoginMode ? 'Welcome back 👋' : 'Join the crew 🚀'}
            </Text>

            {!isLoginMode && (
              <LightInput placeholder="Full Name" value={name} onChangeText={setName} />
            )}
            <LightInput placeholder="College Email" value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" />
            <LightInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
            {!isLoginMode && (
              <LightInput placeholder="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
            )}

            {!isLoginMode && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.fieldLabel}>I am joining as</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  {['student', 'organizer'].map(r => (
                    <TouchableOpacity key={r} onPress={() => setRole(r)} activeOpacity={0.8}
                      style={[styles.roleChip, role === r && styles.roleChipActive]}>
                      <Text style={{ fontSize: 18 }}>{r === 'student' ? '🎓' : '🎛️'}</Text>
                      <Text style={[styles.roleChipText, role === r && { color: C.purple, fontWeight: '700' }]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!isLoginMode && role === 'organizer' && (
              <View style={{ marginBottom: 8 }}>
                <View style={styles.verifyBanner}>
                  <Text style={styles.verifyBannerText}>🔐 Organizer verification required</Text>
                </View>
                <LightInput placeholder="Phone Number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
                <LightInput placeholder="Student ID / Enrollment No." value={studentId} onChangeText={setStudentId} />
                {[
                  { label: 'Club Name', items: CLUB_NAMES, val: clubName, set: setClubName },
                  { label: 'Club Role', items: CLUB_ROLES, val: clubRole, set: setClubRole },
                  { label: 'Department', items: DEPARTMENTS, val: department, set: setDepartment },
                  { label: 'Year of Study', items: STUDY_YEARS, val: studyYear, set: setStudyYear },
                ].map(({ label, items, val, set }) => (
                  <View key={label} style={{ marginBottom: 12 }}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                      {items.map(item => (
                        <FilterPill key={item} label={item} active={val === item} onPress={() => set(item)} />
                      ))}
                    </ScrollView>
                  </View>
                ))}
              </View>
            )}

            <PurpleButton label={isLoginMode ? 'Log In' : 'Create Account'} onPress={handleAuthentication}
              disabled={isLoading} style={{ marginTop: 8 }} />
          </Card>

          <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={{ marginTop: 20, padding: 8 }}>
            <Text style={styles.switchText}>
              {isLoginMode ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: C.purple, fontWeight: '700' }}>
                {isLoginMode ? 'Sign up' : 'Log in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── PROFILE SCREEN ───────────────────────────────────────────────────
function ProfileScreen({ userName, userId, tickets, savedEventIds = [], onToggleWishlist, navigation }) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [wishlistEvents, setWishlistEvents] = useState([]);
  const API_URL = 'http://172.18.12.100:3000/api';

  useEffect(() => {
    if (userId) {
      fetch(`${API_URL}/wishlist/${userId}/events`)
        .then(r => r.json()).then(d => { if (d.success) setWishlistEvents(d.events); }).catch(() => { });
    }
  }, [userId, savedEventIds.length]);

  const attendedTickets = tickets.filter(t => t.attended === 1);
  const pastTickets = tickets.filter(t => t.attended === 1 || new Date(t.date) < new Date()).sort((a, b) => new Date(b.date) - new Date(a.date));
  const upcomingTickets = tickets.filter(t => t.attended !== 1 && new Date(t.date) > new Date());
  const streak = computeStreak(tickets);

  const getTier = (count) => {
    if (count >= 15) return { label: 'Legend 👑', color: '#F59E0B', next: null, needed: 0, progress: 100 };
    if (count >= 8) return { label: 'Gold 🏆', color: '#F59E0B', next: 'Legend', needed: 15 - count, progress: Math.round(count / 15 * 100) };
    if (count >= 5) return { label: 'Silver ⚡', color: '#94A3B8', next: 'Gold', needed: 8 - count, progress: Math.round(count / 8 * 100) };
    if (count >= 1) return { label: 'Bronze 🎯', color: '#CD7F32', next: 'Silver', needed: 5 - count, progress: Math.round(count / 5 * 100) };
    return { label: 'Newcomer', color: C.textMuted, next: 'Bronze', needed: 1, progress: 0 };
  };
  const tier = getTier(attendedTickets.length);
  const badges = BADGE_DEFS.map(b => ({ ...b, earned: b.check(tickets) }));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

      {/* Hero card */}
      <LinearGradient colors={GRAD_HERO} style={styles.profileHero}>
        <Avatar name={userName} size={80} fontSize={28} />
        <Text style={styles.profileName}>{userName}</Text>
        <Text style={styles.profileSub}>Student · ClubCascade</Text>
        <View style={[styles.tierChip, { borderColor: 'rgba(255,255,255,0.4)' }]}>
          <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>{tier.label}</Text>
        </View>
      </LinearGradient>

      {/* Stats row */}
      <Card style={styles.statsRow}>
        {[
          { num: attendedTickets.length, label: 'Attended' },
          { num: upcomingTickets.length, label: 'Upcoming' },
          { num: streak, label: '🔥 Streak' },
        ].map((s, i) => (
          <View key={i} style={[styles.statCell, i < 2 && { borderRightWidth: 0.5, borderRightColor: C.border }]}>
            <Text style={styles.statNum}>{s.num}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </Card>

      {/* Tier progress */}
      {tier.next && (
        <Card style={{ marginHorizontal: 20, marginTop: 14, padding: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={styles.cardTitle}>Progress to {tier.next}</Text>
            <Text style={{ color: C.purple, fontWeight: '700', fontSize: 13 }}>{tier.progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient colors={GRAD_PURPLE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${tier.progress}%` }]} />
          </View>
          <Text style={styles.progressHint}>{tier.needed} more event{tier.needed !== 1 ? 's' : ''} to reach {tier.next}</Text>
        </Card>
      )}

      {/* Badges */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <SectionHeader title="Your Badges" />
        <View style={styles.badgeGrid}>
          {badges.map(b => (
            <View key={b.id} style={[styles.badgeItem, !b.earned && { opacity: 0.35 }]}>
              <View style={[styles.badgeIconBox, b.earned && { backgroundColor: C.purplePale, borderColor: C.borderMid }]}>
                <Text style={{ fontSize: 22 }}>{b.icon}</Text>
              </View>
              <Text style={styles.badgeName}>{b.name}</Text>
              {b.earned && <View style={styles.badgeDot} />}
            </View>
          ))}
        </View>
      </View>

      {/* Saved events */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <TouchableOpacity onPress={() => setIsWishlistOpen(!isWishlistOpen)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>🔖 Saved Events</Text>
          <Text style={{ color: C.purple, fontSize: 14, fontWeight: '600' }}>{isWishlistOpen ? 'Hide' : `Show (${wishlistEvents.length})`}</Text>
        </TouchableOpacity>
        {isWishlistOpen && (
          wishlistEvents.length === 0
            ? <Text style={styles.emptyText}>No saved events yet. Tap 🏷️ to bookmark!</Text>
            : wishlistEvents.map((e, i) => (
              <Card key={i} style={{ marginBottom: 10, padding: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.cardTitle}>{e.title}</Text>
                    <Text style={styles.cardMeta}>📅 {new Date(e.date).toLocaleDateString()} · 📍 {e.venue}</Text>
                  </View>
                  <TouchableOpacity onPress={() => onToggleWishlist && onToggleWishlist(e.event_id)}
                    style={styles.deleteBtn}>
                    <Text style={{ fontSize: 14 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))
        )}
      </View>

      {/* Event history */}
      {pastTickets.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <TouchableOpacity onPress={() => setIsHistoryOpen(!isHistoryOpen)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Event History</Text>
            <Text style={{ color: C.purple, fontSize: 14, fontWeight: '600' }}>{isHistoryOpen ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
          {isHistoryOpen && pastTickets.map((t, i) => (
            <Card key={i} style={{ marginBottom: 8, padding: 14, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t.title}</Text>
                <Text style={styles.cardMeta}>{new Date(t.date).toLocaleDateString()} · {t.venue}</Text>
              </View>
              {t.attended === 1
                ? <View style={styles.attendedBadge}><Text style={styles.attendedBadgeText}>Attended</Text></View>
                : <View style={styles.missedBadge}><Text style={styles.missedBadgeText}>Missed</Text></View>
              }
            </Card>
          ))}
        </View>
      )}

      {/* Settings */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <SectionHeader title="Settings" />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {[
            { icon: '🔔', label: 'Notifications' },
            { icon: '🎯', label: 'My Interests' },
            { icon: '🔒', label: 'Change Password' },
          ].map((item, idx, arr) => (
            <TouchableOpacity key={item.label} activeOpacity={0.7}
              style={[styles.menuRow, idx < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: C.border }]}>
              <View style={styles.menuIconBox}>
                <Text style={{ fontSize: 16 }}>{item.icon}</Text>
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={{ color: C.textMuted, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          ))}
        </Card>
      </View>

      {/* Logout */}
      <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
        <TouchableOpacity onPress={() => Alert.alert('Log out?', 'See you next time 👋', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log out', style: 'destructive', onPress: () => navigation.replace('Login') },
        ])} style={styles.logoutRow}>
          <View style={[styles.menuIconBox, { backgroundColor: '#FEF2F2' }]}>
            <Text style={{ fontSize: 16 }}>🚪</Text>
          </View>
          <Text style={[styles.menuLabel, { color: C.accentRed }]}>Log out</Text>
          <Text style={{ color: C.accentRed, fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.versionText}>ClubCascade v2.0 · Made with ❤️</Text>
    </ScrollView>
  );
}

// ─── CALENDAR MINI VIEW ───────────────────────────────────────────────
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function CalendarMini({ events, selectedDate, onSelectDate }) {
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dayMap = {};
  events.forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(e.category || 'General');
    }
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isToday = d => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const isSelected = d => d && selectedDate && selectedDate.getDate() === d && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;

  const getCatColor = cat => { const f = CATEGORIES.find(c => c.label === cat); return f ? f.color : C.purple; };

  return (
    <Card style={{ marginHorizontal: 20, marginBottom: 12, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity onPress={() => setDisplayMonth(new Date(year, month - 1, 1))} style={styles.calNavBtn}>
          <Text style={{ color: C.purple, fontSize: 18, fontWeight: '700' }}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.calMonthLabel}>{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity onPress={() => setDisplayMonth(new Date(year, month + 1, 1))} style={styles.calNavBtn}>
          <Text style={{ color: C.purple, fontSize: 18, fontWeight: '700' }}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {DAY_LABELS.map((d, i) => (
          <Text key={i} style={styles.calDayHeader}>{d}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          const dots = day ? (dayMap[day] || []) : [];
          const sel = isSelected(day);
          const tod = isToday(day);
          return (
            <TouchableOpacity key={i} activeOpacity={0.7}
              onPress={() => { if (!day) return; const nd = new Date(year, month, day); onSelectDate(sel ? null : nd); }}
              style={{ width: '14.28%', alignItems: 'center', paddingVertical: 3 }}>
              <View style={[styles.calDayCell,
              sel && { backgroundColor: C.purple },
              !sel && tod && { borderWidth: 1.5, borderColor: C.purple },
              ]}>
                <Text style={{ color: day ? (sel ? '#FFF' : C.text) : 'transparent', fontSize: 13, fontWeight: tod ? '700' : '400' }}>{day || ''}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 2, height: 5, marginTop: 1 }}>
                {dots.slice(0, 3).map((cat, di) => (
                  <View key={di} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: getCatColor(cat) }} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedDate && (
        <TouchableOpacity onPress={() => onSelectDate(null)} style={{ marginTop: 10, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20, backgroundColor: C.bgSection }}>
          <Text style={{ color: C.textSub, fontSize: 12 }}>✕ Clear filter</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

// ─── STUDENT DASHBOARD ────────────────────────────────────────────────
function StudentDashboard({ route, navigation }) {
  const { userName, userId } = route.params;
  const [events, setEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [myTickets, setMyTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewMode, setViewMode] = useState('events');
  const [savedEventIds, setSavedEventIds] = useState([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedCalDate, setSelectedCalDate] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedAlertGroup, setExpandedAlertGroup] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventQueries, setEventQueries] = useState([]);
  const [newQueryMessage, setNewQueryMessage] = useState('');
  const [followingFeed, setFollowingFeed] = useState([]);
  const [likedEventIds, setLikedEventIds] = useState({});  // { event_id: likeCount }
  const [trendingEvents, setTrendingEvents] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null); // Track message being replied to

  const API_URL = 'http://172.18.12.100:3000/api';
  const SOCKET_URL = 'http://172.18.12.100:3000';

  const groupedNotifications = useMemo(() => {
    const groups = {};
    const extractName = (msg) => {
      let m = msg.match(/^📣 \[(.*?)\]/);
      if (m) return m[1];
      m = msg.match(/^🔔 New Event Alert: (.*?) is happening/);
      if (m) return m[1];
      return 'General Alerts';
    };
    notifications.forEach(n => {
      const g = extractName(n.message);
      if (!groups[g]) groups[g] = { eventName: g, items: [], hasUnread: false, latestDate: new Date(0) };
      groups[g].items.push(n);
      if (!n.is_read) groups[g].hasUnread = true;
      const d = new Date(n.created_at);
      if (d > groups[g].latestDate) groups[g].latestDate = d;
    });
    return Object.values(groups).sort((a, b) => b.latestDate - a.latestDate);
  }, [notifications]);

  useEffect(() => {
    fetchNotifications();
    const socket = io(SOCKET_URL);
    socket.on('new_event_alert', data => { Alert.alert('🚨 Live Drop!', data.message); fetchNotifications(); });
    socket.on('new_event_query', q => setEventQueries(prev => [...prev, q]));
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (viewMode === 'events') fetchEvents();
    else if (viewMode === 'tickets') fetchMyTickets();
    else if (viewMode === 'alerts') fetchNotifications();
  }, [viewMode]);

  useEffect(() => { fetchMyTickets(); fetchWishlist(); }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchEvents(), fetchMyTickets(), fetchNotifications(), fetchWishlist()]);
    setIsRefreshing(false);
  };

  const fetchNotifications = async () => {
    try {
      const r = await fetch(`${API_URL}/notifications/${userId}`);
      const d = await r.json();
      if (d.success) { setNotifications(d.notifications); setUnreadCount(d.notifications.filter(n => !n.is_read).length); }
    } catch (_) { }
  };

  const handleMarkAsRead = async (id) => {
    try { await fetch(`${API_URL}/notifications/read/${id}`, { method: 'POST' }); fetchNotifications(); } catch (_) { }
  };

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}/events`);
      const d = await r.json();
      if (d.success) setEvents(d.events.filter(e => e.status !== 'pending'));

      const r2 = await fetch(`${API_URL}/feed/following`);
      const d2 = await r2.json();
      if (d2.success) setFollowingFeed(d2.events);

      const r3 = await fetch(`${API_URL}/events/trending`);
      const d3 = await r3.json();
      if (d3.success) setTrendingEvents(d3.events);
    } catch (_) { Alert.alert('Error', 'Could not load events.'); }
    finally { setIsLoading(false); }
  };

  const fetchWishlist = async () => {
    try {
      const r = await fetch(`${API_URL}/wishlist/${userId}`);
      const d = await r.json();
      if (d.success) setSavedEventIds(d.saved_ids);
    } catch (_) { }
  };

  const fetchMyTickets = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}/tickets/${userId}`);
      const d = await r.json();
      if (d.success) setMyTickets(d.tickets);
    } catch (_) { }
    finally { setIsLoading(false); }
  };

  const handleToggleWishlist = async (eventId) => {
    try {
      const r = await fetch(`${API_URL}/wishlist/toggle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, event_id: eventId }),
      });
      const d = await r.json();
      if (d.success) setSavedEventIds(prev => d.saved ? [...prev, eventId] : prev.filter(id => id !== eventId));
    } catch (_) { }
  };

  const handleShareEvent = async (item) => {
    try {
      const dateStr = new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      await Share.share({ title: item.title, message: `🎪 ${item.title}\n\n📅 ${dateStr}\n📍 ${item.venue}\n\nCheck it out on ClubCascade!` });
    } catch (_) { }
  };

  const handleToggleLike = async (eventId) => {
    try {
      const r = await fetch(`${API_URL}/events/${eventId}/like`, { method: 'POST' });
      const d = await r.json();
      if (d.success) {
        setLikedEventIds(prev => ({ ...prev, [eventId]: { liked: d.liked, count: d.likes } }));
        // refresh trending
        const r2 = await fetch(`${API_URL}/events/trending`);
        const d2 = await r2.json();
        if (d2.success) setTrendingEvents(d2.events);
      }
    } catch (_) {}
  };

  const handleRegister = async (eventId) => {
    try {
      const r = await fetch(`${API_URL}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, event_id: eventId }),
      });
      const d = await r.json();
      Alert.alert(d.success ? "You're In! 🎉" : 'Heads up', d.message);
      if (d.success) fetchMyTickets();
    } catch (_) { }
  };

  const handleCancelRegistration = (regId) => {
    Alert.alert('Cancel Ticket?', 'Your spot will be permanently lost.', [
      { text: 'Nevermind', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive', onPress: async () => {
          try {
            const r = await fetch(`${API_URL}/cancel-registration/${regId}`, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) { Alert.alert('Withdrawn', d.message); fetchMyTickets(); }
          } catch (_) { }
        }
      },
    ]);
  };

  const openEventDetails = async (event) => {
    setSelectedEvent(event);
    setIsDetailsModalVisible(true);
    try {
      const r = await fetch(`${API_URL}/queries/${event.event_id}`);
      const d = await r.json();
      if (d.success) setEventQueries(d.queries);
    } catch (_) { }
  };

  const handlePostQuery = async () => {
    if (!newQueryMessage.trim()) return;
    try {
      await fetch(`${API_URL}/queries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          event_id: selectedEvent.event_id, 
          user_id: userId, 
          user_name: userName, 
          message: newQueryMessage,
          parent_query_id: replyingTo?.query_id || null
        }),
      });
      setNewQueryMessage('');
      setReplyingTo(null);
    } catch (_) { }
  };

  const getCatColor = cat => { const f = CATEGORIES.find(c => c.label === cat); return f ? f.color : C.purple; };

  const filteredEvents = selectedCategory === 'Following' ? followingFeed : events.filter(e => {
    const matchCat = selectedCategory === 'All' || e.category === selectedCategory;
    const matchSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchDate = !selectedCalDate || new Date(e.date).toDateString() === selectedCalDate.toDateString();
    return matchCat && matchSearch && matchDate;
  });

  // ── Event card (matches reference design) ──
  const renderEvent = ({ item }) => {
    const catColor = getCatColor(item.category);
    const isSaved = savedEventIds.includes(item.event_id);
    const now = new Date();
    const eventDate = new Date(item.date);

    // Smart state detection
    const isEnded = eventDate < now;
    const isRegistered = myTickets.some(t => Number(t.event_id) === Number(item.event_id));
    const myTicket = myTickets.find(t => Number(t.event_id) === Number(item.event_id));
    const isFull = !isRegistered && item.limit_participants > 0 && Number(item.current_registered) >= Number(item.limit_participants);

    const lData = likedEventIds[item.event_id];
    const isLiked = lData?.liked;
    const likeCount = lData?.count ?? item.likes_count ?? 0;

    // Determine CTA state
    let ctaState = 'register'; // default
    if (isEnded) ctaState = 'ended';
    else if (isRegistered) ctaState = 'registered';
    else if (isFull) ctaState = 'full';

    return (
      <TouchableOpacity onPress={() => openEventDetails(item)} activeOpacity={0.92} style={styles.eventCard}>
        {/* Cover image */}
        <View style={styles.eventCardImageWrap}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={styles.eventCardImage} resizeMode="cover" />
            : (
              <LinearGradient colors={[catColor + '40', catColor + '15']} style={styles.eventCardImagePlaceholder}>
                <Text style={{ fontSize: 52 }}>{CATEGORIES.find(c => c.label === item.category)?.icon || '🎪'}</Text>
              </LinearGradient>
            )
          }
          {/* Top badges */}
          <View style={styles.eventCardBadgeRow}>
            <View style={[styles.catChip, { backgroundColor: catColor }]}>
              <Text style={styles.catChipText}>{item.category || 'General'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {isRegistered && (
                <View style={{ backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontSize: 11 }}>✅</Text>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}>Registered</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => handleShareEvent(item)} style={styles.eventIconBtn}>
                <Text style={{ fontSize: 14 }}>🔗</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleToggleWishlist(item.event_id)} style={[styles.eventIconBtn, isSaved && { backgroundColor: C.purple }]}>
                <Text style={{ fontSize: 14 }}>{isSaved ? '🔖' : '🏷️'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Info below image */}
        <View style={styles.eventCardBody}>
          <Text style={styles.eventDateLine}>
            {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()} · {eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.eventCardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <Text style={styles.eventCardMeta}>📍 {item.venue}</Text>
            {item.limit_participants > 0 && (
              <Text style={[styles.eventCardMeta, isFull && { color: C.accentRed, fontWeight: '700' }]}>
                👥 {item.current_registered ?? 0}/{item.limit_participants} {isFull ? '· FULL' : ''}
              </Text>
            )}
            {item.organizer_id && (
              <TouchableOpacity onPress={() => navigation.navigate('ClubProfile', { orgId: item.organizer_id, currentUserId: userId })} style={{ backgroundColor: C.bgSection, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: C.purple, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>VIEW CLUB ➔</Text>
              </TouchableOpacity>
            )}
          </View>
          {item.description ? (
            <Text style={styles.eventCardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}

          {/* ── SMART CTA SECTION ── */}
          <View style={{ marginTop: 14 }}>

            {/* STATE: ENDED */}
            {ctaState === 'ended' && (
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontWeight: '800', color: '#9CA3AF', fontSize: 14 }}>⏳ Event Ended</Text>
              </View>
            )}

            {/* STATE: FULL */}
            {ctaState === 'full' && (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' }}>
                <Text style={{ fontWeight: '800', color: C.accentRed, fontSize: 14 }}>🚫 Event Full</Text>
              </View>
            )}

            {/* STATE: REGISTERED */}
            {ctaState === 'registered' && (
              <View>
                <View style={{ backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 8, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#A7F3D0' }}>
                  <Text style={{ fontWeight: '800', color: '#059669', fontSize: 14 }}>✅ You're Registered!</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setViewMode('tickets')}
                    style={{ flex: 1, backgroundColor: C.bgSection, borderRadius: 14, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border }}
                  >
                    <Text style={{ color: C.purple, fontWeight: '800', fontSize: 13 }}>🎟 View Ticket</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => myTicket && handleCancelRegistration(myTicket.registration_id)}
                    style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' }}
                  >
                    <Text style={{ color: C.accentRed, fontWeight: '800', fontSize: 13 }}>✕ Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STATE: REGISTER */}
            {ctaState === 'register' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PurpleButton label="Register Now" onPress={() => handleRegister(item.event_id)} style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => handleToggleLike(item.event_id)}
                  style={[
                    styles.detailsBtn,
                    { flexDirection: 'row', gap: 4, paddingHorizontal: 12,
                      backgroundColor: isLiked ? '#FFF0F5' : C.bgSection,
                      borderColor: isLiked ? '#FF4D80' : C.border, borderWidth: 1 }
                  ]}
                >
                  <Text style={{ fontSize: 16 }}>{isLiked ? '❤️' : '🤍'}</Text>
                  <Text style={{ color: isLiked ? '#FF4D80' : C.textSub, fontWeight: '700', fontSize: 13 }}>{likeCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEventDetails(item)} style={styles.detailsBtn}>
                  <Text style={{ color: C.purple, fontSize: 18, fontWeight: '700' }}>›</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Like row for registered/full/ended states */}
            {ctaState !== 'register' && (
              <TouchableOpacity
                onPress={() => handleToggleLike(item.event_id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' }}
              >
                <Text style={{ fontSize: 16 }}>{isLiked ? '❤️' : '🤍'}</Text>
                <Text style={{ color: isLiked ? '#FF4D80' : C.textSub, fontWeight: '700', fontSize: 13 }}>{likeCount} likes</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };


  // ── Ticket card ──
  const renderTicket = ({ item }) => {
    const past = new Date(item.date) < new Date();
    const status = item.attended === 1 ? 'verified' : past ? 'missed' : 'upcoming';
    const statusStyles = {
      verified: { bg: '#ECFDF5', text: '#059669', label: '✅ Verified' },
      missed: { bg: '#FEF2F2', text: C.accentRed, label: '❌ Missed' },
      upcoming: { bg: C.bgSection, text: C.purple, label: '🎟 Upcoming' },
    }[status];

    return (
      <Card style={{ marginBottom: 16, overflow: 'hidden' }}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: 140 }} resizeMode="cover" /> : null}
        <View style={[styles.ticketStatusBar, { backgroundColor: statusStyles.bg }]}>
          <Text style={[styles.ticketStatusText, { color: statusStyles.text }]}>{statusStyles.label}</Text>
        </View>
        <View style={{ padding: 20 }}>
          <Text style={styles.ticketTitle}>{item.title}</Text>
          <Text style={styles.cardMeta}>📅 {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
          <Text style={styles.cardMeta}>📍 {item.venue}</Text>
          <View style={styles.qrSection}>
            <Text style={styles.qrLabel}>Show at the door</Text>
            <View style={styles.qrFrame}>
              <QRCode value={item.registration_id.toString()} size={160} color={C.purple} backgroundColor="transparent" />
            </View>
            <View style={[styles.ticketIdPill, { backgroundColor: C.bgSection }]}>
              <Text style={[styles.ticketIdText, { color: C.purple }]}>Ticket #{item.registration_id}</Text>
            </View>
          </View>
          <PurpleButton label="Withdraw Ticket" onPress={() => handleCancelRegistration(item.registration_id)}
            style={{ marginTop: 12 }} outline />
        </View>
      </Card>
    );
  };

  // ── Alert group row ──
  const renderAlertGroup = ({ item }) => {
    const isExpanded = expandedAlertGroup === item.eventName;
    return (
      <View style={{ marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setExpandedAlertGroup(isExpanded ? null : item.eventName)}
          style={[styles.alertRow, item.hasUnread && { borderLeftWidth: 3, borderLeftColor: C.purple }]}
          activeOpacity={0.8}>
          <View style={{ flex: 1, paddingLeft: item.hasUnread ? 10 : 0 }}>
            <Text style={styles.cardTitle}>{item.eventName}</Text>
            <Text style={styles.cardMeta}>{item.items.length} update{item.items.length !== 1 ? 's' : ''}</Text>
          </View>
          {item.hasUnread && <View style={styles.unreadDot} />}
          <Text style={{ color: C.textMuted, fontSize: 18, marginLeft: 8 }}>{isExpanded ? '⌃' : '⌄'}</Text>
        </TouchableOpacity>
        {isExpanded && (
          <View style={{ paddingLeft: 16, backgroundColor: C.bgCard, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderWidth: 0.5, borderTopWidth: 0, borderColor: C.border }}>
            {item.items.map((notif, idx) => {
              const clean = notif.message.replace(/^📣 \[.*?\] /, '').replace(/^🔔 New Event Alert: .*? is happening at (.*?)!/, 'Now happening at $1!');
              return (
                <TouchableOpacity key={notif.notification_id} onPress={() => handleMarkAsRead(notif.notification_id)}
                  style={{ paddingVertical: 10, paddingRight: 16, borderBottomWidth: idx < item.items.length - 1 ? 0.5 : 0, borderColor: C.border }}>
                  <Text style={[styles.alertText, { opacity: notif.is_read ? 0.55 : 1 }]}>{clean}</Text>
                  <Text style={styles.alertDate}>{new Date(notif.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</Text>
                  {!notif.is_read && <Text style={{ color: C.purple, fontSize: 11, marginTop: 2, fontWeight: '700' }}>New ·</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const STUDENT_TABS = [
    { key: 'events', icon: '✦', label: 'Discover' },
    { key: 'tickets', icon: '🎟', label: 'Tickets' },
    { key: 'alerts', icon: '🔔', label: 'Alerts', badge: unreadCount > 0 ? unreadCount : null },
    { key: 'profile', icon: '👤', label: 'Profile' },
  ];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header */}
      {viewMode !== 'profile' && (
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topBarAppName}>ClubCascade</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={() => setViewMode('alerts')} style={styles.bellBtn}>
                <Text style={{ fontSize: 18 }}>🔔</Text>
                <View style={styles.bellBadge}><Text style={styles.navBadgeText}>{unreadCount}</Text></View>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setViewMode('profile')} activeOpacity={0.8}>
              <Avatar name={userName} size={36} fontSize={13} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Profile tab */}
      {viewMode === 'profile' && (
        <ProfileScreen userName={userName} userId={userId} tickets={myTickets}
          savedEventIds={savedEventIds} onToggleWishlist={handleToggleWishlist} navigation={navigation} />
      )}

      {/* Discover filters */}
      {viewMode === 'events' && (
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          {/* Greeting */}
          <Text style={styles.greeting}>Hey, {userName.split(' ')[0]} 👋</Text>
          <Text style={styles.greetingSub}>Discover what's happening on campus</Text>

          {/* Search bar */}
          <View style={[styles.searchBar, { marginTop: 14 }]}>
            <Text style={{ color: C.textMuted, fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput style={styles.searchInput} placeholder="Search events..." placeholderTextColor={C.textMuted}
              value={searchQuery} onChangeText={setSearchQuery} />
            <TouchableOpacity onPress={() => { setIsCalendarOpen(p => !p); if (isCalendarOpen) setSelectedCalDate(null); }}
              style={[styles.calBtn, isCalendarOpen && { backgroundColor: C.purple }]}>
              <Text style={{ fontSize: 15 }}>📅</Text>
            </TouchableOpacity>
          </View>

          {isCalendarOpen && <CalendarMini events={events} selectedDate={selectedCalDate} onSelectDate={setSelectedCalDate} />}

          {/* Category pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            <FilterPill label="🔔 Following" active={selectedCategory === 'Following'} onPress={() => setSelectedCategory('Following')} color={C.accentGreen} />
            {CATEGORIES.map(cat => (
              <FilterPill key={cat.label} label={cat.icon + ' ' + cat.label}
                active={selectedCategory === cat.label} onPress={() => setSelectedCategory(cat.label)} color={cat.color} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tickets header */}
      {viewMode === 'tickets' && (
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
          <Text style={styles.greeting}>My Tickets 🎟️</Text>
          <Text style={styles.greetingSub}>{myTickets.filter(t => !t.attended).length} upcoming event{myTickets.filter(t => !t.attended).length !== 1 ? 's' : ''}</Text>
        </View>
      )}

      {/* Alerts header */}
      {viewMode === 'alerts' && (
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
          <Text style={styles.greeting}>Alerts 🔔</Text>
          <Text style={styles.greetingSub}>{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</Text>
        </View>
      )}

      {/* Main list */}
      {viewMode !== 'profile' && (
        isLoading && !isRefreshing
          ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={C.purple} />
              <Text style={{ color: C.textMuted, marginTop: 12 }}>Loading...</Text>
            </View>
          )
          : (
            <FlatList
              data={viewMode === 'events' ? filteredEvents : viewMode === 'tickets' ? myTickets.filter(t => !t.attended) : groupedNotifications}
              keyExtractor={item => viewMode === 'events' ? item.event_id.toString() : viewMode === 'tickets' ? item.registration_id.toString() : item.eventName}
              renderItem={viewMode === 'events' ? renderEvent : viewMode === 'tickets' ? renderTicket : renderAlertGroup}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 4 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={C.purple} colors={[C.purple]} />}
              ListHeaderComponent={viewMode === 'events' && trendingEvents.length > 0 ? (
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 20 }}>🔥</Text>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: C.text, marginLeft: 6 }}>Trending Now</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
                    {trendingEvents.map(e => {
                      const catColor = getCatColor(e.category);
                      const lData = likedEventIds[e.event_id];
                      const isLiked = lData?.liked ?? !!e.user_liked;
                      const likeCount = lData?.count ?? e.likes_count ?? 0;
                      return (
                        <TouchableOpacity key={e.event_id} onPress={() => openEventDetails(e)} activeOpacity={0.9}
                          style={{ width: 200, backgroundColor: C.bgCard, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border, elevation: 3, shadowColor: C.shadow, shadowOpacity: 0.08, shadowRadius: 8 }}>
                          {e.image_url
                            ? <Image source={{ uri: e.image_url }} style={{ width: '100%', height: 100 }} resizeMode="cover" />
                            : <LinearGradient colors={[catColor + '60', catColor + '20']} style={{ width: '100%', height: 100, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 36 }}>{CATEGORIES.find(c => c.label === e.category)?.icon || '🎪'}</Text>
                              </LinearGradient>
                          }
                          <View style={{ padding: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }} numberOfLines={2}>{e.title}</Text>
                            <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>📍 {e.venue}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={{ fontSize: 14 }}>{isLiked ? '❤️' : '🤍'}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: isLiked ? '#FF4D80' : C.textSub }}>{likeCount}</Text>
                              </View>
                              <TouchableOpacity onPress={() => handleToggleLike(e.event_id)}
                                style={{ backgroundColor: isLiked ? '#FFF0F5' : C.bgSection, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                                <Text style={{ fontSize: 11, fontWeight: '800', color: isLiked ? '#FF4D80' : C.purple }}>
                                  {isLiked ? 'Unlike' : 'Like'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 52, marginBottom: 12 }}>
                    {viewMode === 'events' ? '🎪' : viewMode === 'tickets' ? '🎟️' : '🔔'}
                  </Text>
                  <Text style={styles.emptyStateTitle}>
                    {viewMode === 'events' ? 'No events found' : viewMode === 'tickets' ? 'No tickets yet' : 'All caught up!'}
                  </Text>
                  <Text style={styles.emptyStateSub}>
                    {viewMode === 'events' ? 'Try a different filter' : viewMode === 'tickets' ? 'Register for an event to get started' : 'No new alerts'}
                  </Text>
                </View>
              }
            />
          )
      )}

      <BottomNav tabs={STUDENT_TABS} active={viewMode} onChange={setViewMode} />

      {/* Event Details Modal */}
      {selectedEvent && (() => {
        const item = selectedEvent;
        const now = new Date();
        const eventDate = new Date(item.date);
        const isEnded = eventDate < now;
        const isRegistered = myTickets.some(t => Number(t.event_id) === Number(item.event_id));
        const myTicket = myTickets.find(t => Number(t.event_id) === Number(item.event_id));
        const isFull = !isRegistered && item.limit_participants > 0 && Number(item.current_registered) >= Number(item.limit_participants);
        const lData = likedEventIds[item.event_id];
        const isLiked = lData?.liked;
        const likeCount = lData?.count ?? item.likes_count ?? 0;

        let ctaState = 'register';
        if (isEnded) ctaState = 'ended';
        else if (isRegistered) ctaState = 'registered';
        else if (isFull) ctaState = 'full';

        return (
          <Modal visible={isDetailsModalVisible} animationType="slide" presentationStyle="pageSheet"
            onRequestClose={() => setIsDetailsModalVisible(false)}>
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bgCard }}>
              <View style={styles.modalNav}>
                <TouchableOpacity onPress={() => setIsDetailsModalVisible(false)} style={styles.modalCloseBtn}>
                  <Text style={{ color: C.textSub, fontSize: 16, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedEvent.title}</Text>
                <View style={{ width: 36 }} />
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                {selectedEvent.image_url
                  ? <Image source={{ uri: selectedEvent.image_url }} style={styles.modalHeroImg} resizeMode="cover" />
                  : (
                    <LinearGradient colors={[getCatColor(selectedEvent.category) + '40', getCatColor(selectedEvent.category) + '10']}
                      style={styles.modalHeroPlaceholder}>
                      <Text style={{ fontSize: 60 }}>{CATEGORIES.find(c => c.label === selectedEvent.category)?.icon || '🎪'}</Text>
                    </LinearGradient>
                  )
                }

                <View style={[styles.catChip, { backgroundColor: getCatColor(selectedEvent.category), alignSelf: 'flex-start', marginTop: 16, marginBottom: 10 }]}>
                  <Text style={styles.catChipText}>{selectedEvent.category || 'General'}</Text>
                </View>

                <Text style={styles.modalEventTitle}>{selectedEvent.title}</Text>

                <View style={styles.modalMetaRow}>
                  <View style={styles.modalMetaCard}>
                    <Text style={styles.modalMetaCardLabel}>DATE & TIME</Text>
                    <Text style={styles.modalMetaCardValue}>{new Date(selectedEvent.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                    <Text style={[styles.modalMetaCardValue, { fontSize: 13, color: C.textSub }]}>{new Date(selectedEvent.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} onwards</Text>
                  </View>
                  <View style={styles.modalMetaCard}>
                    <Text style={styles.modalMetaCardLabel}>VENUE</Text>
                    <Text style={styles.modalMetaCardValue}>{selectedEvent.venue}</Text>
                    {item.limit_participants > 0 && (
                      <Text style={{ fontSize: 12, color: isFull ? C.accentRed : C.textMuted, fontWeight: '700', marginTop: 4 }}>
                        👥 {item.current_registered || 0}/{item.limit_participants} Spots {isFull ? '(FULL)' : ''}
                      </Text>
                    )}
                  </View>
                </View>

                {selectedEvent.description ? (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.modalSectionLabel}>ABOUT</Text>
                    <Text style={styles.modalDesc}>{selectedEvent.description}</Text>
                  </View>
                ) : null}

                {/* SMART CTA BOARD */}
                <View style={{ marginTop: 24, marginBottom: 20 }}>
                  {ctaState === 'ended' && (
                    <View style={{ backgroundColor: '#F3F4F6', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
                      <Text style={{ fontWeight: '800', color: '#9CA3AF', fontSize: 16 }}>⏳ This event has ended</Text>
                    </View>
                  )}

                  {ctaState === 'full' && (
                    <View style={{ backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' }}>
                      <Text style={{ fontWeight: '800', color: C.accentRed, fontSize: 16 }}>🚫 Event is Full</Text>
                    </View>
                  )}

                  {ctaState === 'registered' && (
                    <View>
                      <View style={{ backgroundColor: '#ECFDF5', borderRadius: 16, paddingVertical: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#A7F3D0' }}>
                        <Text style={{ fontWeight: '800', color: '#059669', fontSize: 16 }}>✅ You're on the guest list!</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => { setIsDetailsModalVisible(false); setViewMode('tickets'); }}
                          style={{ flex: 1, backgroundColor: C.bgSection, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border }}
                        >
                          <Text style={{ color: C.purple, fontWeight: '800', fontSize: 14 }}>🎟 View QR Ticket</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => myTicket && handleCancelRegistration(myTicket.registration_id)}
                          style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' }}
                        >
                          <Text style={{ color: C.accentRed, fontWeight: '800', fontSize: 14 }}>✕ Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {ctaState === 'register' && (
                    <PurpleButton label="Register Instantly" icon="🎟" onPress={() => handleRegister(selectedEvent.event_id)} />
                  )}
                </View>

                {/* Community Chat Feed */}
                <View style={styles.qaSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <View style={styles.qaDot} />
                    <Text style={styles.modalSectionLabel}>COMMUNITY CHAT</Text>
                  </View>
                  
                  {eventQueries.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: C.textMuted, marginVertical: 20 }}>No messages yet. Start the conversation! 👋</Text>
                  ) : (
                    eventQueries.map((q, i) => {
                      const isMe = q.user_name === userName;
                      const isOrg = q.user_name.includes('[Organizer]');
                      const parent = q.parent_query_id ? eventQueries.find(item => item.query_id === q.parent_query_id) : null;
                      const timeStr = q.created_at ? new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                      
                      return (
                        <View key={i} style={[styles.qaBubbleWrap, isMe && { alignItems: 'flex-end' }]}>
                          <View style={[
                            styles.qaBubble, 
                            isMe ? styles.qaBubbleSelf : isOrg ? styles.qaBubbleOrg : null,
                            { maxWidth: '85%' }
                          ]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <Text style={[styles.qaBubbleName, isMe ? { color: '#FFF' } : isOrg ? { color: C.purple } : null]}>
                                {isMe ? 'You' : q.user_name}
                              </Text>
                              <Text style={{ fontSize: 10, color: isMe ? '#E0E0E0' : C.textMuted, marginLeft: 10 }}>{timeStr}</Text>
                            </View>
                            
                            {parent && (
                              <View style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: isMe ? '#FFF' : C.purple }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isMe ? '#FFF' : C.text }}>{parent.user_name}</Text>
                                <Text style={{ fontSize: 11, color: isMe ? '#EEE' : C.textSub }} numberOfLines={1}>{parent.message}</Text>
                              </View>
                            )}
                            
                            <Text style={[styles.qaBubbleMsg, isMe && { color: '#FFF' }]}>{q.message}</Text>
                            
                            <TouchableOpacity onPress={() => setReplyingTo(q)} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: isMe ? '#FFF' : C.purple }}>Reply</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}

                  {/* Input Row */}
                  {replyingTo && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bgSection, padding: 8, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomWidth: 1, borderColor: C.border }}>
                      <View>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: C.purple }}>Replying to {replyingTo.user_name}</Text>
                        <Text style={{ fontSize: 11, color: C.textSub }} numberOfLines={1}>{replyingTo.message}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setReplyingTo(null)}><Text style={{ color: C.accentRed, fontWeight: '800' }}>✕</Text></TouchableOpacity>
                    </View>
                  )}
                  <View style={[styles.qaInputRow, replyingTo && { borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
                    <TextInput style={styles.qaInput} placeholder={replyingTo ? "Write a reply..." : "Say something..."} placeholderTextColor={C.textMuted}
                      value={newQueryMessage} onChangeText={setNewQueryMessage} />
                    <TouchableOpacity onPress={handlePostQuery} style={styles.qaSendBtn}>
                      <LinearGradient colors={GRAD_PURPLE} style={StyleSheet.absoluteFill} borderRadius={12} />
                      <Text style={{ fontSize: 18, color: '#FFF' }}>➤</Text>
                    </TouchableOpacity>
                  </View>
                </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      );
      })()}
    </View>
  );
}

// ─── ORGANIZER STOREFRONT COMPONENT ───────────────────────────────────
function OrganizerStorefront({ userId }) {
  const [bio, setBio] = useState('');
  const [insta, setInsta] = useState('');
  const [logoUri, setLogoUri] = useState(null);
  const [bannerUri, setBannerUri] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [galleryCaption, setGalleryCaption] = useState('');
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [newPhotoUri, setNewPhotoUri] = useState(null);
  const API_URL = 'http://172.18.12.100:3000/api';

  useEffect(() => {
    fetchProfile();
    fetchPhotos();
  }, []);

  const fetchProfile = async () => {
    try {
      const r = await fetch(`${API_URL}/clubs/${userId}`);
      const d = await r.json();
      if (d.success && d.profile) {
        setBio(d.profile.bio || '');
        setInsta(d.profile.instagram_handle || '');
        setLogoUri(d.profile.logo_url || null);
        setBannerUri(d.profile.banner_url || null);
      }
    } catch (_) {}
  };

  const fetchPhotos = async () => {
    try {
      const r = await fetch(`${API_URL}/clubs/${userId}/photos`);
      const d = await r.json();
      if (d.success) setPhotos(d.photos);
    } catch (_) {}
  };

  const pickImage = async (setter) => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.8 });
    if (!r.canceled) setter(r.assets[0].uri);
  };

  const saveProfile = async () => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('bio', bio);
      formData.append('instagram_handle', insta);
      if (logoUri && !logoUri.startsWith('http')) formData.append('logo', { uri: logoUri, name: 'logo.jpg', type: 'image/jpeg' });
      else if (logoUri) formData.append('logo_url', logoUri);
      
      if (bannerUri && !bannerUri.startsWith('http')) formData.append('banner', { uri: bannerUri, name: 'banner.jpg', type: 'image/jpeg' });
      else if (bannerUri) formData.append('banner_url', bannerUri);

      const r = await fetch(`${API_URL}/clubs/profile`, { method: 'PUT', body: formData });
      const d = await r.json();
      Alert.alert(d.success ? 'Saved!' : 'Error', d.message);
    } catch (_) { Alert.alert('Error', 'Could not save profile'); }
    finally { setIsLoading(false); }
  };

  const uploadPhoto = async () => {
    if (!newPhotoUri) return Alert.alert('Missing Image', 'Please select a photo first');
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('caption', galleryCaption);
      formData.append('photo', { uri: newPhotoUri, name: 'gallery.jpg', type: 'image/jpeg' });
      
      const r = await fetch(`${API_URL}/clubs/photos`, { method: 'POST', body: formData });
      const d = await r.json();
      if (d.success) {
        Alert.alert('Posted!', d.message);
        setIsPhotoModalOpen(false);
        setNewPhotoUri(null);
        setGalleryCaption('');
        fetchPhotos();
      } else { Alert.alert('Error', d.message); }
    } catch (_) { Alert.alert('Error', 'Upload failed'); }
    finally { setIsLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>My Storefront</Text>
      <Text style={styles.pageSub}>Customize your public club profile</Text>
      
      <Card style={{ marginTop: 16 }}>
        <Text style={styles.fieldLabel}>Banner Image</Text>
        <TouchableOpacity style={[styles.uploadArea, {minHeight: 120}]} onPress={() => pickImage(setBannerUri)}>
          {bannerUri ? <Image source={{ uri: bannerUri }} style={{width: '100%', height: 120, borderRadius: 10}} resizeMode="cover" /> 
                    : <Text style={{color: C.textSub, fontWeight: '600'}}>Tap to Upload Banner (16:9)</Text>}
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>Profile Logo</Text>
        <TouchableOpacity style={{width: 80, height: 80, borderRadius: 20, backgroundColor: C.bgSection, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.border}} onPress={() => pickImage(setLogoUri)}>
          {logoUri ? <Image source={{ uri: logoUri }} style={{width: '100%', height: '100%', borderRadius: 20}} resizeMode="cover" /> 
                  : <Text style={{fontSize: 24}}>📸</Text>}
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>Club Bio</Text>
        <LightInput placeholder="What is your club about?" value={bio} onChangeText={setBio} multiline style={{minHeight: 80}} />
        
        <Text style={styles.fieldLabel}>Instagram Action Handle</Text>
        <LightInput placeholder="@techsociety" value={insta} onChangeText={setInsta} />
        
        <PurpleButton label="Save Changes ✓" onPress={saveProfile} disabled={isLoading} style={{marginTop: 10}} />
      </Card>

      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 16}}>
        <Text style={styles.pageTitle}>Gallery</Text>
        <TouchableOpacity onPress={() => setIsPhotoModalOpen(true)} style={{backgroundColor: C.purplePale, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14}}>
          <Text style={{color: C.purple, fontWeight: '800'}}>+ POST</Text>
        </TouchableOpacity>
      </View>

      {photos.length === 0 ? (
        <Card style={{alignItems: 'center', padding: 30}}><Text style={{color: C.textMuted}}>No photos uploaded yet.</Text></Card>
      ) : (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'}}>
          {photos.map(p => (
            <View key={p.photo_id} style={{width: '48%', marginBottom: 12}}>
              <Image source={{uri: p.image_url}} style={{width: '100%', height: 160, borderRadius: 14}} resizeMode="cover" />
            </View>
          ))}
        </View>
      )}

      {/* Upload Photo Modal */}
      <Modal visible={isPhotoModalOpen} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{flex: 1, backgroundColor: C.bg}}>
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={() => setIsPhotoModalOpen(false)} style={styles.modalCloseBtn}><Text style={{fontSize: 16, fontWeight: '700'}}>✕</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Post to Gallery</Text>
            <View style={{width: 36}}/>
          </View>
          <ScrollView contentContainerStyle={{padding: 20}}>
             <TouchableOpacity style={[styles.uploadArea, {minHeight: 200}]} onPress={() => pickImage(setNewPhotoUri)}>
               {newPhotoUri ? <Image source={{uri: newPhotoUri}} style={{width: '100%', height: 200, borderRadius: 10}} resizeMode="cover" /> 
                            : <Text style={{color: C.textSub, fontWeight: '600'}}>Tap to Select Photo 📸</Text>}
             </TouchableOpacity>
             <Text style={styles.fieldLabel}>Caption (Optional)</Text>
             <LightInput placeholder="Write a short caption..." value={galleryCaption} onChangeText={setGalleryCaption} />
             <PurpleButton label="Upload & Notify Followers 🚀" onPress={uploadPhoto} disabled={isLoading} style={{marginTop: 16}} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

// ─── ORGANIZER DASHBOARD ──────────────────────────────────────────────
function OrganizerDashboard({ route, navigation }) {
  const { userName, userId } = route.params;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [limitParticipants, setLimitParticipants] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [viewMode, setViewMode] = useState('create');
  const [stats, setStats] = useState([]);
  const [category, setCategory] = useState('General');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manageEvents, setManageEvents] = useState([]);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [currentEventObj, setCurrentEventObj] = useState(null);
  const [organizerQueries, setOrganizerQueries] = useState([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editImageUri, setEditImageUri] = useState(null);
  const [editDate, setEditDate] = useState(new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showEditTimePicker, setShowEditTimePicker] = useState(false);
  const [isAttendeesVisible, setIsAttendeesVisible] = useState(false);
  const [selectedEventTitle, setSelectedEventTitle] = useState('');
  const [attendeesList, setAttendeesList] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null); // Track message being replied to

  const API_URL = 'http://172.18.12.100:3000/api';
  const SOCKET_URL = 'http://172.18.12.100:3000';

  useEffect(() => {
    if (viewMode === 'stats') fetchStats();
    else if (viewMode === 'manage') fetchOrganizerEvents();
  }, [viewMode]);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on('new_event_query', q => setOrganizerQueries(prev => [...prev, q]));
    return () => socket.disconnect();
  }, []);

  const fetchStats = () => {
    fetch(`${API_URL}/stats`).then(r => r.json()).then(d => { if (d.success) setStats(d.stats); }).catch(() => { });
  };

  const fetchOrganizerEvents = async () => {
    try {
      const r = await fetch(`${API_URL}/organizers/${userId}/events`);
      const d = await r.json();
      if (d.success) setManageEvents(d.events);
    } catch (_) { }
  };

  const executeDelete = (eventId) => {
    Alert.alert('Delete Event?', 'This removes all registrations too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const r = await fetch(`${API_URL}/events/${eventId}`, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) { Alert.alert('Deleted!', d.message); fetchOrganizerEvents(); }
          } catch (_) { }
        }
      },
    ]);
  };

  const handleBroadcast = (eventId, eventTitle) => {
    Alert.prompt('📣 Broadcast', `Message all registrants of "${eventTitle}":`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send', onPress: async (msg) => {
          if (!msg?.trim()) return;
          try {
            const r = await fetch(`${API_URL}/events/${eventId}/broadcast`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: msg.trim(), eventTitle }),
            });
            const d = await r.json();
            Alert.alert(d.success ? '🚀 Sent!' : '❌ Failed', d.message);
          } catch (_) { }
        }
      },
    ], 'plain-text');
  };

  const openEditModal = (event) => {
    setCurrentEventObj(event);
    setEditTitle(event.title); setEditDesc(event.description); setEditVenue(event.venue);
    setEditLimit(event.limit_participants.toString()); setEditCategory(event.category || 'General');
    setEditImageUri(event.image_url); if (event.date) setEditDate(new Date(event.date));
    setIsEditModalVisible(true);
  };

  const executeUpdate = async () => {
    try {
      const formData = new FormData();
      formData.append('title', editTitle); formData.append('description', editDesc);
      formData.append('venue', editVenue); formData.append('limit_participants', editLimit || 0);
      formData.append('category', editCategory);
      if (editImageUri && !editImageUri.startsWith('http'))
        formData.append('poster', { uri: editImageUri, name: 'poster.jpg', type: 'image/jpeg' });
      else formData.append('image_url', editImageUri || '');
      const formattedDate = editDate.getFullYear() + '-' + String(editDate.getMonth() + 1).padStart(2, '0') + '-' + String(editDate.getDate()).padStart(2, '0') + ' ' + String(editDate.getHours()).padStart(2, '0') + ':' + String(editDate.getMinutes()).padStart(2, '0') + ':00';
      formData.append('date', formattedDate);
      const r = await fetch(`${API_URL}/events/${currentEventObj.event_id}`, { method: 'PUT', body: formData });
      const d = await r.json();
      if (d.success) { Alert.alert('Updated! ✨', d.message); setIsEditModalVisible(false); fetchOrganizerEvents(); }
      else Alert.alert('Error', d.message);
    } catch (_) { Alert.alert('Error', 'Server unreachable.'); }
  };

  const openOrganizerChat = async (event) => {
    setCurrentEventObj(event); setIsChatVisible(true);
    try {
      const r = await fetch(`${API_URL}/queries/${event.event_id}`);
      const d = await r.json();
      if (d.success) setOrganizerQueries(d.queries);
    } catch (_) { }
  };

  const handleOrganizerReply = async () => {
    if (!replyMessage.trim()) return;
    try {
      await fetch(`${API_URL}/queries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: currentEventObj.event_id, user_id: 1, user_name: `[Organizer] ${userName}`, message: replyMessage }),
      });
      setReplyMessage('');
    } catch (_) { }
  };

  const viewAttendees = async (eventId, eventTitle) => {
    try {
      const r = await fetch(`${API_URL}/attendees/${eventId}`);
      const d = await r.json();
      if (d.success) { setAttendeesList(d.attendees); setSelectedEventTitle(eventTitle); setIsAttendeesVisible(true); }
    } catch (_) { }
  };

  const exportToCSV = async () => {
    try {
      let csv = 'Student Name,Email Address\n';
      attendeesList.forEach(u => { csv += `"${u.name}","${u.email}"\n`; });
      const fileUri = FileSystem.documentDirectory + `${selectedEventTitle.replace(/\s+/g, '_')}_Attendance.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
    } catch (_) { }
  };

  const onChangeDate = (e, d) => { setShowDatePicker(false); if (d) { setDate(d); setTimeout(() => setShowTimePicker(true), 150); } };
  const onChangeTime = (e, t) => { setShowTimePicker(false); if (t) { const nd = new Date(date); nd.setHours(t.getHours()); nd.setMinutes(t.getMinutes()); setDate(nd); } };
  const formatMySQL = d => d.toISOString().slice(0, 19).replace('T', ' ');

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (!r.canceled) setImageUri(r.assets[0].uri);
  };

  const handleCreateEvent = async () => {
    if (!title || !venue) { Alert.alert('Hold on', 'Title and Venue required'); return; }
    setIsPosting(true);
    try {
      const formData = new FormData();
      formData.append('title', title); formData.append('description', description);
      formData.append('date', formatMySQL(date)); formData.append('venue', venue);
      formData.append('limit_participants', limitParticipants || 0); formData.append('category', category);
      formData.append('organizer_id', userId);
      if (imageUri) formData.append('poster', { uri: imageUri, name: 'poster.jpg', type: 'image/jpeg' });
      const r = await fetch(`${API_URL}/events`, { method: 'POST', body: formData });
      const d = await r.json();
      if (d.success) { Alert.alert('Published! 🚀', 'Event is live!'); setTitle(''); setVenue(''); setDescription(''); setImageUri(null); }
      else Alert.alert('Error', d.message);
    } catch (_) { Alert.alert('Error', 'Server unreachable'); }
    finally { setIsPosting(false); }
  };

  const handleBarCodeScanned = async ({ data }) => {
    setScanned(true);
    try {
      const r = await fetch(`${API_URL}/checkin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registration_id: data }) });
      const d = await r.json();
      Alert.alert(d.success ? '✅ Verified!' : '❌ Invalid', d.message, [{ text: d.success ? 'Scan Next' : 'Try Again', onPress: () => setScanned(false) }]);
    } catch (_) { setScanned(false); }
  };

  const ORGANIZER_CATS = ['General', 'Tech', 'Arts', 'Sports', 'Party', 'Workshop'];
  const ORG_TABS = [
    { key: 'create', icon: '✦', label: 'Create' },
    { key: 'manage', icon: '🎛', label: 'Manage' },
    { key: 'scan', icon: '📷', label: 'Scan QR' },
    { key: 'stats', icon: '📊', label: 'Stats' },
    { key: 'profile', icon: '🛠', label: 'Storefront' },
  ];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarAppName}>ClubCascade</Text>
          <Text style={{ fontSize: 12, color: C.textMuted, fontWeight: '600' }}>Organizer Hub</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Log out?', '', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log out', style: 'destructive', onPress: () => navigation.replace('Login') },
        ])} style={styles.exitBtn}>
          <Text style={styles.exitBtnText}>Exit</Text>
        </TouchableOpacity>
      </View>

      {/* CREATE */}
      {viewMode === 'create' && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.pageTitle}>Create New Event</Text>
          <Text style={styles.pageSub}>Fill in the details below to publish</Text>

          <Card style={{ marginTop: 16 }}>
            <LightInput placeholder="Event Title" value={title} onChangeText={setTitle} />
            <LightInput placeholder="Description" value={description} onChangeText={setDescription} multiline style={{ minHeight: 80 }} />
            <LightInput placeholder="Venue / Location" value={venue} onChangeText={setVenue} />
            <LightInput placeholder="Capacity limit (e.g. 50)" keyboardType="numeric" value={limitParticipants} onChangeText={setLimitParticipants} />

            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 16 }}>
              {ORGANIZER_CATS.map(cat => {
                const obj = CATEGORIES.find(c => c.label === cat);
                return <FilterPill key={cat} label={(obj?.icon || '') + ' ' + cat} active={category === cat} onPress={() => setCategory(cat)} color={obj?.color} />;
              })}
            </ScrollView>

            <TouchableOpacity style={styles.uploadArea} onPress={pickImage}>
              {imageUri
                ? <Image source={{ uri: imageUri }} style={styles.uploadPreview} resizeMode="cover" />
                : (
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <View style={styles.uploadIcon}><Text style={{ fontSize: 24 }}>📸</Text></View>
                    <Text style={{ color: C.textSub, fontWeight: '600', fontSize: 14 }}>Upload Cover Image</Text>
                    <Text style={{ color: C.textMuted, fontSize: 12 }}>Tap to select from gallery</Text>
                  </View>
                )
              }
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Date & Time</Text>
            <TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(true)}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>📅</Text>
              <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>
                {date.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}
              </Text>
            </TouchableOpacity>
            {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />}
            {showTimePicker && <DateTimePicker value={date} mode="time" display="default" onChange={onChangeTime} />}

            <PurpleButton label="Publish Event 🚀" onPress={handleCreateEvent} disabled={isPosting} style={{ marginTop: 8 }} />
          </Card>
        </ScrollView>
      )}

      {/* MANAGE */}
      {viewMode === 'manage' && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={fetchOrganizerEvents} tintColor={C.purple} />}>
          <Text style={styles.pageTitle}>My Events</Text>
          <Text style={styles.pageSub}>Manage your published events</Text>
          {manageEvents.length === 0
            ? <ActivityIndicator size="large" color={C.purple} style={{ marginTop: 40 }} />
            : manageEvents.map(item => (
              <Card key={item.event_id} style={{ marginTop: 14 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardMeta}>📅 {new Date(item.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} · 📍 {item.venue}</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionChip}>
                    <Text style={styles.actionChipText}>🖍️ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => executeDelete(item.event_id)} style={[styles.actionChip, styles.actionChipDanger]}>
                    <Text style={[styles.actionChipText, { color: C.accentRed }]}>❌ Delete</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => openOrganizerChat(item)} style={styles.fullActionBtn}>
                  <LinearGradient colors={GRAD_PURPLE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} borderRadius={12} />
                  <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>💬 Q&A Hub</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleBroadcast(item.event_id, item.title)} style={[styles.fullActionBtn, { marginTop: 8, backgroundColor: '#FFF7ED', borderWidth: 0.5, borderColor: '#FED7AA' }]}>
                  <Text style={{ color: '#EA580C', fontWeight: '700', fontSize: 14 }}>📣 Broadcast to Registrants</Text>
                </TouchableOpacity>
              </Card>
            ))
          }
        </ScrollView>
      )}

      {/* SCAN */}
      {viewMode === 'scan' && (
        <View style={{ flex: 1, alignItems: 'center', padding: 20 }}>
          <Text style={styles.pageTitle}>Scan Tickets</Text>
          <Text style={styles.pageSub}>Point camera at student QR codes</Text>
          {!permission ? (
            <ActivityIndicator size="large" color={C.purple} style={{ marginTop: 40 }} />
          ) : !permission.granted ? (
            <Card style={{ marginTop: 24, alignItems: 'center', padding: 32 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
              <Text style={styles.cardTitle}>Camera Access Needed</Text>
              <PurpleButton label="Grant Access" onPress={requestPermission} style={{ marginTop: 16 }} />
            </Card>
          ) : (
            <View style={styles.scannerWrap}>
              <LinearGradient colors={GRAD_PURPLE} style={StyleSheet.absoluteFill} borderRadius={20} />
              <View style={styles.scannerInner}>
                <CameraView style={StyleSheet.absoluteFillObject} facing="back"
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }} />
              </View>
            </View>
          )}
          {scanned && (
            <PurpleButton label="Scan Next Ticket" onPress={() => setScanned(false)} style={{ marginTop: 24, width: '100%' }} />
          )}
        </View>
      )}

      {/* STATS */}
      {viewMode === 'stats' && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.pageTitle}>Live Analytics</Text>
          <Text style={styles.pageSub}>Real-time event performance</Text>
          {stats.length === 0
            ? <ActivityIndicator size="large" color={C.purple} style={{ marginTop: 40 }} />
            : stats.map(item => {
              const reg = item.total_registered || 0;
              const att = item.total_attended || 0;
              const pct = reg > 0 ? (att / reg) * 100 : 0;
              return (
                <Card key={item.event_id} style={{ marginTop: 14 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginVertical: 14 }}>
                    {[
                      { val: reg, label: 'Registered', color: C.purple },
                      { val: att, label: 'Attended', color: C.accentGreen },
                      { val: pct.toFixed(0) + '%', label: 'Show-up', color: C.accent },
                    ].map((chip, i) => (
                      <View key={i} style={[styles.statChipBox, { borderColor: chip.color + '40', backgroundColor: chip.color + '10' }]}>
                        <Text style={[styles.statChipNum, { color: chip.color }]}>{chip.val}</Text>
                        <Text style={styles.statChipLabel}>{chip.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: C.accentGreen, borderRadius: 4 }]} />
                  </View>
                  {att > 0 && (
                    <TouchableOpacity onPress={() => viewAttendees(item.event_id, item.title)} style={[styles.fullActionBtn, { marginTop: 12 }]}>
                      <LinearGradient colors={['#0EA5E9', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} borderRadius={12} />
                      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>View Attendees ➔</Text>
                    </TouchableOpacity>
                  )}
                </Card>
              );
            })
          }

          {/* Attendees modal */}
          <Modal visible={isAttendeesVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsAttendeesVisible(false)}>
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bgCard }}>
              <View style={styles.modalNav}>
                <TouchableOpacity onPress={() => setIsAttendeesVisible(false)} style={styles.modalCloseBtn}>
                  <Text style={{ color: C.textSub, fontSize: 16, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedEventTitle}</Text>
                <TouchableOpacity onPress={exportToCSV} style={styles.csvBtn}>
                  <Text style={styles.csvBtnText}>CSV ⬇</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ paddingHorizontal: 20, paddingVertical: 10, color: C.textSub, fontSize: 13, fontWeight: '600', borderBottomWidth: 0.5, borderColor: C.border }}>
                {attendeesList.length} checked-in students
              </Text>
              <FlatList data={attendeesList} keyExtractor={(_, i) => i.toString()}
                contentContainerStyle={{ padding: 20 }}
                renderItem={({ item }) => (
                  <Card style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', padding: 14 }}>
                    <Avatar name={item.name} size={42} fontSize={15} />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.cardMeta}>{item.email}</Text>
                    </View>
                  </Card>
                )} />
            </SafeAreaView>
          </Modal>
        </ScrollView>
      )}

      {/* STOREFRONT */}
      {viewMode === 'profile' && (
        <OrganizerStorefront userId={userId} />
      )}

      <BottomNav tabs={ORG_TABS} active={viewMode} onChange={setViewMode} />

      {/* Edit modal */}
      <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgCard }}>
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={() => setIsEditModalVisible(false)} style={styles.modalCloseBtn}>
              <Text style={{ color: C.textSub, fontSize: 16, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Event</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <LightInput placeholder="Title" value={editTitle} onChangeText={setEditTitle} />
            <LightInput placeholder="Description" value={editDesc} onChangeText={setEditDesc} multiline style={{ minHeight: 80 }} />
            <LightInput placeholder="Venue" value={editVenue} onChangeText={setEditVenue} />
            <LightInput placeholder="Capacity" value={editLimit} onChangeText={setEditLimit} keyboardType="numeric" />
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 16 }}>
              {ORGANIZER_CATS.map(cat => {
                const obj = CATEGORIES.find(c => c.label === cat);
                return <FilterPill key={cat} label={(obj?.icon || '') + ' ' + cat} active={editCategory === cat} onPress={() => setEditCategory(cat)} color={obj?.color} />;
              })}
            </ScrollView>
            <TouchableOpacity style={styles.uploadArea} onPress={async () => {
              const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.8 });
              if (!r.canceled) setEditImageUri(r.assets[0].uri);
            }}>
              {editImageUri
                ? <Image source={{ uri: editImageUri }} style={styles.uploadPreview} resizeMode="cover" />
                : <View style={{ alignItems: 'center', gap: 8 }}><Text style={{ fontSize: 24 }}>📸</Text><Text style={{ color: C.textSub, fontSize: 14, fontWeight: '600' }}>Change Cover</Text></View>
              }
            </TouchableOpacity>
            <Text style={styles.fieldLabel}>Date & Time</Text>
            <TouchableOpacity style={styles.datePicker} onPress={() => setShowEditDatePicker(true)}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>📅</Text>
              <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>{editDate.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.datePicker, { marginTop: 8 }]} onPress={() => setShowEditTimePicker(true)}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>⏰</Text>
              <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>{editDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </TouchableOpacity>
            {showEditDatePicker && <DateTimePicker value={editDate} mode="date" display="default" onChange={(e, d) => { setShowEditDatePicker(false); if (d) setEditDate(d); }} />}
            {showEditTimePicker && <DateTimePicker value={editDate} mode="time" display="default" onChange={(e, d) => { setShowEditTimePicker(false); if (d) setEditDate(d); }} />}
            <PurpleButton label="Save Changes ✓" onPress={executeUpdate} style={{ marginTop: 20 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Chat modal */}
      <Modal visible={isChatVisible} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgCard }}>
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={() => setIsChatVisible(false)} style={styles.modalCloseBtn}>
              <Text style={{ color: C.textSub, fontSize: 16, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>💬 {currentEventObj?.title}</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={{ flex: 1, padding: 20 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {organizerQueries.length === 0 ? (
                <Text style={{ textAlign: 'center', color: C.textMuted, marginVertical: 40 }}>No messages yet from students.</Text>
              ) : (
                organizerQueries.map((q, i) => {
                  const isMe = q.user_name.includes('[Organizer]');
                  const parent = q.parent_query_id ? organizerQueries.find(item => item.query_id === q.parent_query_id) : null;
                  const timeStr = q.created_at ? new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                  return (
                    <View key={i} style={[styles.qaBubbleWrap, isMe && { alignItems: 'flex-end' }]}>
                      <View style={[
                        styles.qaBubble, 
                        isMe ? styles.qaBubbleOrg : null,
                        { maxWidth: '85%' }
                      ]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={[styles.qaBubbleName, isMe ? { color: '#0EA5E9' } : null]}>
                            {q.user_name}
                          </Text>
                          <Text style={{ fontSize: 10, color: C.textMuted, marginLeft: 10 }}>{timeStr}</Text>
                        </View>
                        
                        {parent && (
                          <View style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: isMe ? '#0EA5E9' : C.purple }}>
                            <Text style={{ fontSize: 11, fontWeight: '700' }}>{parent.user_name}</Text>
                            <Text style={{ fontSize: 11, color: C.textSub }} numberOfLines={1}>{parent.message}</Text>
                          </View>
                        )}
                        
                        <Text style={styles.qaBubbleMsg}>{q.message}</Text>
                        
                        <TouchableOpacity onPress={() => setReplyingTo(q)} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: isMe ? '#0EA5E9' : C.purple }}>Reply</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Input Row */}
            {replyingTo && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bgSection, padding: 8, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomWidth: 1, borderColor: C.border }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: C.purple }}>Replying to {replyingTo.user_name}</Text>
                  <Text style={{ fontSize: 11, color: C.textSub }} numberOfLines={1}>{replyingTo.message}</Text>
                </View>
                <TouchableOpacity onPress={() => setReplyingTo(null)}><Text style={{ color: C.accentRed, fontWeight: '800' }}>✕</Text></TouchableOpacity>
              </View>
            )}
            <View style={[styles.qaInputRow, replyingTo && { borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
              <TextInput style={styles.qaInput} placeholder={replyingTo ? "Write a reply..." : "Reply to students..."} placeholderTextColor={C.textMuted}
                value={replyMessage} onChangeText={setReplyMessage} />
              <TouchableOpacity onPress={handleOrganizerReply} style={styles.qaSendBtn}>
                <LinearGradient colors={GRAD_PURPLE} style={StyleSheet.absoluteFill} borderRadius={12} />
                <Text style={{ fontSize: 18, color: '#FFF' }}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────
function AdminDashboard({ route, navigation }) {
  const { userName } = route.params;
  const [viewMode, setViewMode] = useState('stats');
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const API_URL = 'http://172.18.12.100:3000/api';

  const ADMIN_TABS = [
    { key: 'stats', icon: '📊', label: 'Analytics' },
    { key: 'users', icon: '👥', label: 'Users' },
    { key: 'events', icon: '🎪', label: 'Events' },
  ];

  useEffect(() => {
    if (viewMode === 'stats') fetchStats();
    else if (viewMode === 'users') fetchUsers();
    else fetchEvents();
  }, [viewMode]);

  const fetchStats = async () => { setIsLoading(true); try { const r = await fetch(`${API_URL}/admin/stats`); const d = await r.json(); if (d.success) setStats(d.stats); } catch (_) { } finally { setIsLoading(false); } };
  const fetchUsers = async () => { setIsLoading(true); try { const r = await fetch(`${API_URL}/admin/users`); const d = await r.json(); if (d.success) setUsers(d.users); } catch (_) { } finally { setIsLoading(false); } };
  const fetchEvents = async () => { setIsLoading(true); try { const r = await fetch(`${API_URL}/events`); const d = await r.json(); if (d.success) setEvents(d.events); } catch (_) { } finally { setIsLoading(false); } };

  const handleApproveUser = (id, name) => Alert.alert('Approve', `Allow ${name} to access Organizer Hub?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: async () => { await fetch(`${API_URL}/admin/users/${id}/approve`, { method: 'PUT' }); fetchUsers(); } }]);
  const handlePromoteUser = (id, name) => Alert.alert('Promote', `Upgrade ${name} to Organizer?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Promote', onPress: async () => { await fetch(`${API_URL}/admin/users/${id}/role`, { method: 'PUT' }); fetchUsers(); } }]);
  const handleDeleteUser = (id, name) => Alert.alert('Ban User', `Permanently delete ${name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' }); fetchUsers(); } }]);
  const handleApproveEvent = (id) => Alert.alert('Approve Event', 'Make this event visible to all?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Publish', onPress: async () => { await fetch(`${API_URL}/admin/events/${id}/approve`, { method: 'PUT' }); fetchEvents(); } }]);
  const handleDeleteEvent = (id, title) => Alert.alert('Delete', `Destroy "${title}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Destroy', style: 'destructive', onPress: async () => { await fetch(`${API_URL}/admin/events/${id}`, { method: 'DELETE' }); fetchEvents(); } }]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarAppName}>ClubCascade</Text>
          <Text style={{ fontSize: 12, color: C.accentRed, fontWeight: '700' }}>Admin · God-Mode</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Log out?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => navigation.replace('Login') }])} style={styles.exitBtn}>
          <Text style={styles.exitBtnText}>Exit</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.purple} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { fetchUsers(); fetchEvents(); fetchStats(); }} tintColor={C.purple} />}>

          {/* STATS */}
          {viewMode === 'stats' && stats && (
            <>
              <Text style={styles.pageTitle}>Platform Overview</Text>
              <Text style={styles.pageSub}>Live metrics across all clubs</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                {[
                  { icon: '🎪', val: stats.totalEvents, label: 'Total Events', color: C.purple },
                  { icon: '🎟️', val: stats.totalRegistrations, label: 'Registrations', color: C.accentBlue },
                ].map((s, i) => (
                  <Card key={i} style={{ flex: 1, alignItems: 'center', padding: 20 }}>
                    <Text style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</Text>
                    <Text style={[styles.pageTitle, { color: s.color, marginBottom: 4 }]}>{s.val || 0}</Text>
                    <Text style={styles.cardMeta}>{s.label}</Text>
                  </Card>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                {[
                  { icon: '✅', val: `${stats.attendanceRate || 0}%`, label: 'Attendance Rate', color: C.accentGreen },
                  { icon: '💬', val: stats.totalEngagement, label: 'Q&A Messages', color: C.accent },
                ].map((s, i) => (
                  <Card key={i} style={{ flex: 1, alignItems: 'center', padding: 20 }}>
                    <Text style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</Text>
                    <Text style={[styles.pageTitle, { color: s.color, marginBottom: 4 }]}>{s.val || 0}</Text>
                    <Text style={styles.cardMeta}>{s.label}</Text>
                  </Card>
                ))}
              </View>
            </>
          )}

          {/* USERS */}
          {viewMode === 'users' && (
            <>
              {/* PENDING ORGANIZERS */}
              {users.filter(u => u.account_status === 'pending').length > 0 && (
                <View style={styles.pendingAppHeader}>
                  <Text style={styles.pendingAppTitle}>Pending Organizers</Text>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>{users.filter(u => u.account_status === 'pending').length} NEW</Text>
                  </View>
                </View>
              )}

              {users.filter(u => u.account_status === 'pending').map((item, i) => (
                <View key={`pending-user-${i}`} style={styles.pendingCard}>
                  <View style={styles.pendingDecorator} />
                  <Text style={styles.pendingCatLabel}>CLUB REGISTRATION</Text>
                  <Text style={styles.pendingTitle}>{item.name}</Text>
                  
                  {item.club_name && (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={[styles.pendingDesc, { marginBottom: 4, fontWeight: '700' }]}>{item.club_name} ({item.club_role})</Text>
                      <Text style={[styles.pendingDesc, { marginBottom: 2, opacity: 0.7 }]}>Dept: {item.department} · {item.study_year}</Text>
                      <Text style={[styles.pendingDesc, { marginBottom: 0, opacity: 0.7 }]}>Student ID: {item.student_id}</Text>
                      <Text style={[styles.pendingDesc, { marginBottom: 0, opacity: 0.7 }]}>Email: {item.email}</Text>
                    </View>
                  )}
                  
                  <View style={styles.approveActionRow}>
                    <TouchableOpacity onPress={() => handleApproveUser(item.user_id, item.name)} style={styles.approvePrimaryBtn}>
                      <Text style={styles.approvePrimaryText}>Approve Organizer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteUser(item.user_id, item.name)} style={styles.rejectSecondaryBtn}>
                      <Text style={{ fontSize: 16, color: '#7C3AED' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* ACTIVE USERS */}
              {users.filter(u => u.account_status !== 'pending').length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 10, marginBottom: 14, fontSize: 24, fontWeight: '900', color: '#1E1B4B' }]}>Club Directory</Text>
                  <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 20, marginTop: -10 }}>Managing {users.filter(u => u.account_status !== 'pending').length} active platform members</Text>
                  
                  {users.filter(u => u.account_status !== 'pending').map((item, i) => (
                    <View key={`active-user-${i}`} style={styles.activeCard}>
                      <View style={styles.activeCardHeader}>
                        <View style={styles.activeCardIconBox}>
                          <Text style={{ fontSize: 24, color: '#FFF' }}>{item.role === 'admin' ? '👑' : item.role === 'organizer' ? '🎪' : '👤'}</Text>
                        </View>
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>ACTIVE</Text>
                        </View>
                      </View>
                      
                      <Text style={styles.activeTitle}>{item.club_name || item.name}</Text>
                      <Text style={styles.activeDesc} numberOfLines={2}>
                        {item.role === 'organizer' ? `Organizer for ${item.department}` : `Platform ${item.role}`}
                        {'\n'}{item.email}
                      </Text>
                      
                      <View style={styles.activeMetaRow}>
                        <View>
                          <Text style={styles.activeMetaLabel}>ROLE</Text>
                          <Text style={styles.activeMetaValue}>{item.role.toUpperCase()}</Text>
                        </View>
                        <View>
                          <Text style={styles.activeMetaLabel}>STUDENT ID</Text>
                          <Text style={styles.activeMetaValue}>{item.student_id || 'N/A'}</Text>
                        </View>
                      </View>
                      
                      <View style={styles.activeActionRow}>
                        {item.role === 'student' && (
                          <TouchableOpacity onPress={() => handlePromoteUser(item.user_id, item.name)} style={styles.activeActionBtn}>
                            <Text style={{ fontSize: 20 }}>⭐</Text>
                            <Text style={[styles.activeActionText, { color: '#8B5CF6' }]}>PROMOTE</Text>
                          </TouchableOpacity>
                        )}
                        {item.role !== 'admin' && (
                          <TouchableOpacity onPress={() => handleDeleteUser(item.user_id, item.name)} style={styles.activeActionBtn}>
                            <Text style={{ fontSize: 20 }}>🚫</Text>
                            <Text style={[styles.activeActionText, { color: '#EF4444' }]}>DEACTIVATE</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {users.length === 0 && (
                <View style={{ alignItems: 'center', marginTop: 60 }}>
                  <Text style={{ fontSize: 40, marginBottom: 10 }}>👥</Text>
                  <Text style={styles.cardTitle}>No Users Found</Text>
                  <Text style={styles.cardMeta}>The platform is empty</Text>
                </View>
              )}
            </>
          )}

          {/* EVENTS - PENDING APPROVALS */}
          {viewMode === 'events' && (
            <>
              {events.filter(e => e.status === 'pending').length > 0 && (
                <View style={styles.pendingAppHeader}>
                  <Text style={styles.pendingAppTitle}>Pending Applications</Text>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>{events.filter(e => e.status === 'pending').length} NEW</Text>
                  </View>
                </View>
              )}

              {events.filter(e => e.status === 'pending').map((item, i) => (
                <View key={i} style={styles.pendingCard}>
                  <View style={styles.pendingDecorator} />
                  <Text style={styles.pendingCatLabel}>{item.category?.toUpperCase() || 'GENERAL'}</Text>
                  <Text style={styles.pendingTitle}>{item.title}</Text>
                  <Text style={styles.pendingDesc} numberOfLines={3}>{item.description || "Seeking approval for a community project and weekly workshops."}</Text>
                  
                  <View style={styles.approveActionRow}>
                    <TouchableOpacity onPress={() => handleApproveEvent(item.event_id)} style={styles.approvePrimaryBtn}>
                      <Text style={styles.approvePrimaryText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteEvent(item.event_id, item.title)} style={styles.rejectSecondaryBtn}>
                      <Text style={{ fontSize: 16, color: '#7C3AED' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* APPROVED EVENTS (Premium Card List) */}
              {events.filter(e => e.status !== 'pending').length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 10, marginBottom: 14, fontSize: 24, fontWeight: '900', color: '#1E1B4B' }]}>Live Events</Text>
                  <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 20, marginTop: -10 }}>Managing {events.filter(e => e.status !== 'pending').length} published events</Text>
                  
                  {events.filter(e => e.status !== 'pending').map((item, i) => (
                    <View key={`active-event-${i}`} style={styles.activeCard}>
                      <View style={styles.activeCardHeader}>
                        <View style={[styles.activeCardIconBox, { backgroundColor: '#EC4899' }]}>
                          <Text style={{ fontSize: 24, color: '#FFF' }}>📅</Text>
                        </View>
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>PUBLISHED</Text>
                        </View>
                      </View>
                      
                      <Text style={styles.activeTitle}>{item.title}</Text>
                      <Text style={styles.activeDesc} numberOfLines={2}>{item.description || 'No description provided.'}</Text>
                      
                      <View style={styles.activeMetaRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.activeMetaLabel}>VENUE</Text>
                          <Text style={styles.activeMetaValue} numberOfLines={1}>{item.venue}</Text>
                        </View>
                        <View>
                          <Text style={styles.activeMetaLabel}>DATE</Text>
                          <Text style={styles.activeMetaValue}>{new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
                        </View>
                      </View>
                      
                      <View style={styles.activeActionRow}>
                        <TouchableOpacity onPress={() => handleDeleteEvent(item.event_id, item.title)} style={styles.activeActionBtn}>
                          <Text style={{ fontSize: 20 }}>🚫</Text>
                          <Text style={[styles.activeActionText, { color: '#EF4444' }]}>DEACTIVATE</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {events.length === 0 && (
                <View style={{ alignItems: 'center', marginTop: 60 }}>
                  <Text style={{ fontSize: 40, marginBottom: 10 }}>🎉</Text>
                  <Text style={styles.cardTitle}>Inbox Zero</Text>
                  <Text style={styles.cardMeta}>No events waiting for approval</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <BottomNav tabs={ADMIN_TABS} active={viewMode} onChange={setViewMode} />
    </SafeAreaView>
  );
}

// ─── CLUB PROFILE SCREEN ────────────────────────────────────────────────
function ClubProfileScreen({ route, navigation }) {
  const { orgId } = route.params;
  const [profile, setProfile] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [mutualFriends, setMutualFriends] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('gallery'); // 'gallery' or 'history'
  const API_URL = 'http://172.18.12.100:3000/api';

  useEffect(() => {
    fetch(`${API_URL}/clubs/${orgId}`).then(r => r.json()).then(d => { if (d.success) setProfile(d.profile) });
    fetch(`${API_URL}/clubs/${orgId}/isFollowing`).then(r => r.json()).then(d => { if (d.success) setIsFollowing(d.following) });
    fetch(`${API_URL}/clubs/${orgId}/photos`).then(r => r.json()).then(d => { if (d.success) setPhotos(d.photos) });
    fetch(`${API_URL}/clubs/${orgId}/mutuals`).then(r => r.json()).then(d => { if (d.success) setMutualFriends(d.mutuals) });
    fetch(`${API_URL}/clubs/${orgId}/history`).then(r => r.json()).then(d => { if (d.success) setPastEvents(d.events) });
  }, [orgId]);

  const toggleFollow = async () => {
    try {
      const r = await fetch(`${API_URL}/clubs/${orgId}/follow`, { method: 'POST' });
      const d = await r.json();
      if (d.success) setIsFollowing(d.following);
    } catch (_) {}
  };

  if (!profile) return <View style={[styles.screen, {justifyContent: 'center', alignItems: 'center'}]}><ActivityIndicator color={C.purple} size="large" /></View>;

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
         {/* Back Button */}
         <TouchableOpacity 
            style={{position: 'absolute', top: 20, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5}} 
            onPress={() => navigation.goBack()}
         >
           <Text style={{fontSize: 20, fontWeight: '800', color: C.text}}>‹</Text>
         </TouchableOpacity>
         
         {/* Banner */}
         {profile.banner_url ? (
           <Image source={{uri: profile.banner_url}} style={{width: '100%', height: 220}} resizeMode="cover" />
         ) : <LinearGradient colors={GRAD_HERO} style={{width: '100%', height: 220}} />}
         
         <View style={{padding: 20, marginTop: -50}}>
           {/* Logo */}
           <View style={{shadowColor: C.purple, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5, backgroundColor: C.bgCard, width: 90, height: 90, borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF', overflow: 'hidden'}}>
             {profile.logo_url ? <Image source={{uri: profile.logo_url}} style={{width: '100%', height: '100%'}} /> : <Avatar name={profile.organizer_name} size={90} fontSize={32} />}
           </View>
           
           <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12}}>
             <View style={{flex: 1}}>
               <Text style={{fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.5}}>{profile.club_name || profile.organizer_name} {profile.club_name ? '✅' : ''}</Text>
               <Text style={{color: C.textSub, fontSize: 13, fontWeight: '600', marginTop: 2}}>{profile.club_role || 'Organizer'}</Text>
             </View>
           </View>

           {profile.bio && <Text style={{color: C.textSub, fontSize: 15, marginTop: 16, lineHeight: 22}}>{profile.bio}</Text>}
           
           <Card style={{flexDirection: 'row', gap: 20, marginTop: 20, paddingVertical: 14}}>
              <View style={{flex: 1, alignItems: 'center'}}><Text style={{fontWeight: '900', fontSize: 20, color: C.purple}}>{profile.followersCount || 0}</Text><Text style={{color: C.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2}}>FOLLOWERS</Text></View>
              <View style={{width: 1, backgroundColor: C.border}} />
              <View style={{flex: 1, alignItems: 'center'}}><Text style={{fontWeight: '900', fontSize: 20, color: C.text}}>{profile.eventsHosted || 0}</Text><Text style={{color: C.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2}}>EVENTS HOSTED</Text></View>
           </Card>

           <PurpleButton 
              label={isFollowing ? 'Following ✓' : 'Follow Club'} 
              outline={isFollowing} 
              onPress={toggleFollow} 
              style={{marginTop: 20}} 
           />

           {mutualFriends && mutualFriends.length > 0 && (
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 14}}>
                 <View style={{flexDirection: 'row'}}>
                   {mutualFriends.slice(0,3).map((f, i) => (
                     <View key={f.id} style={{width: 24, height: 24, borderRadius: 12, backgroundColor: C.purplePale, marginLeft: i > 0 ? -8 : 0, borderWidth: 1.5, borderColor: C.bgCard, alignItems: 'center', justifyContent: 'center'}}>
                       <Text style={{fontSize: 8, fontWeight: '700', color: C.purple}}>{f.name[0]}</Text>
                     </View>
                   ))}
                 </View>
                 <Text style={{fontSize: 12, color: C.textSub, marginLeft: 8}}>
                   Followed by {mutualFriends[0].name} {mutualFriends.length > 1 ? `and ${mutualFriends.length - 1} others` : ''}
                 </Text>
              </View>
           )}

           {/* Profile Feed Tabs */}
           <View style={{flexDirection: 'row', marginTop: 32, borderBottomWidth: 0.5, borderColor: C.border}}>
              <TouchableOpacity onPress={() => setActiveTab('gallery')} style={{flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: activeTab === 'gallery' ? 2 : 0, borderColor: C.text}}>
                 <Text style={{fontSize: 20, opacity: activeTab === 'gallery' ? 1 : 0.4}}>📸</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setActiveTab('history')} style={{flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: activeTab === 'history' ? 2 : 0, borderColor: C.text}}>
                 <Text style={{fontSize: 20, opacity: activeTab === 'history' ? 1 : 0.4}}>🎪</Text>
              </TouchableOpacity>
           </View>
           
           {/* Feed Content */}
           <View style={{marginTop: 16}}>
             {activeTab === 'gallery' && (
                photos && photos.length > 0 ? (
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'}}>
                     {photos.map(p => (
                       <View key={p.photo_id} style={{width: '48%', marginBottom: 12}}>
                         <Image source={{uri: p.image_url}} style={{width: '100%', height: 160, borderRadius: 14}} resizeMode="cover" />
                         {p.caption ? <Text style={{fontSize: 12, color: C.textSub, marginTop: 6, fontWeight: '500'}} numberOfLines={2}>{p.caption}</Text> : null}
                       </View>
                     ))}
                  </View>
                ) : <Text style={{textAlign: 'center', color: C.textMuted, marginTop: 20}}>No photos yet</Text>
             )}

             {activeTab === 'history' && (
                pastEvents && pastEvents.length > 0 ? (
                  pastEvents.map(e => (
                    <Card key={e.event_id} style={{marginBottom: 12}}>
                      <Text style={{fontSize: 16, fontWeight: '800', color: C.text}}>{e.title}</Text>
                      <Text style={{fontSize: 13, color: C.textMuted, marginTop: 4}}>📅 {new Date(e.date).toLocaleDateString()} · 📍 {e.venue}</Text>
                    </Card>
                  ))
                ) : <Text style={{textAlign: 'center', color: C.textMuted, marginTop: 20}}>No past events recorded</Text>
             )}
           </View>
         </View>
      </ScrollView>
    </View>
  );
}

// ─── ROUTER ───────────────────────────────────────────────────────────
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Student" component={StudentDashboard} />
        <Stack.Screen name="Organizer" component={OrganizerDashboard} />
        <Stack.Screen name="Admin" component={AdminDashboard} />
        <Stack.Screen name="ClubProfile" component={ClubProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ─── STYLESHEET ───────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // ── Screen wrapper ──
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : (Platform.OS === 'ios' ? 44 : 0),
  },

  // ── Top bar ──
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: C.bgCard,
    borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  topBarAppName: { fontSize: 22, fontWeight: '800', color: C.purple, letterSpacing: -0.5 },
  exitBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 0.5, borderColor: C.border, backgroundColor: C.bgCard,
  },
  exitBtnText: { color: C.textSub, fontSize: 13, fontWeight: '600' },

  bellBtn: { position: 'relative', padding: 4 },
  bellBadge: {
    position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.accentRed, alignItems: 'center', justifyContent: 'center',
  },

  // ── Login ──
  loginScroll: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: 24, paddingTop: Platform.OS === 'ios' ? 80 : 60,
  },
  logoMark: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.purple, shadowRadius: 16, shadowOpacity: 0.25, elevation: 6,
  },
  appName: { fontSize: 32, fontWeight: '900', color: C.text, letterSpacing: -1, marginTop: 14 },
  appTagline: { fontSize: 15, color: C.textMuted, marginTop: 5 },
  formHeading: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 18, letterSpacing: -0.3 },
  roleChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgInput,
  },
  roleChipActive: { borderColor: C.purple, backgroundColor: C.bgSection },
  roleChipText: { color: C.textSub, fontWeight: '600', fontSize: 14 },
  verifyBanner: { backgroundColor: C.bgSection, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 0.5, borderColor: C.borderMid },
  verifyBannerText: { color: C.purpleDark, fontWeight: '700', fontSize: 13 },
  switchText: { color: C.textMuted, fontSize: 14 },

  // ── Card ──
  card: {
    backgroundColor: C.bgCard, borderRadius: 16,
    borderWidth: 0.5, borderColor: C.border,
    padding: 18,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8, shadowOpacity: 1, elevation: 2,
  },

  // ── Inputs ──
  lightInput: {
    backgroundColor: C.bgInput, borderWidth: 0.5, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    color: C.text, fontSize: 15, marginBottom: 12,
  },
  fieldLabel: { color: C.textSub, fontSize: 13, fontWeight: '600', marginBottom: 4 },

  // ── Buttons ──
  purpleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: 14,
  },
  purpleBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.purple, backgroundColor: C.bgCard,
  },
  outlineBtnText: { color: C.purple, fontSize: 15, fontWeight: '700' },

  // ── Filter pills ──
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.bgCard,
  },
  filterPillText: { color: C.textSub, fontWeight: '600', fontSize: 13 },

  // ── Bottom nav ──
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    backgroundColor: C.bgCard,
    borderTopWidth: 0.5, borderTopColor: C.border,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingHorizontal: 8,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIconWrap: { width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  navIconActive: { backgroundColor: C.bgSection },
  navIcon: { fontSize: 20 },
  navIconActiveText: {},
  navBadge: {
    position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.accentRed, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.bgCard,
  },
  navBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  navLabel: { color: C.textMuted, fontSize: 10, fontWeight: '600' },
  navLabelActive: { color: C.purple, fontWeight: '700' },

  // ── Avatar ──
  avatar: { alignItems: 'center', justifyContent: 'center' },

  // ── Section header ──
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  sectionAction: { fontSize: 13, color: C.purple, fontWeight: '700' },

  // ── Greeting ──
  greeting: { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  greetingSub: { fontSize: 14, color: C.textMuted, marginTop: 3, fontWeight: '500' },

  // ── Search bar ──
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bgCard, borderWidth: 0.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 14 },
  calBtn: { padding: 8, borderRadius: 10, backgroundColor: C.bgSection },

  // ── Event card (reference photo style) ──
  eventCard: {
    backgroundColor: C.bgCard, borderRadius: 18,
    borderWidth: 0.5, borderColor: C.border, marginBottom: 18, overflow: 'hidden',
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10, shadowOpacity: 1, elevation: 3,
  },
  eventCardImageWrap: { position: 'relative' },
  eventCardImage: { width: '100%', height: 200 },
  eventCardImagePlaceholder: { width: '100%', height: 160, alignItems: 'center', justifyContent: 'center' },
  eventCardBadgeRow: {
    position: 'absolute', top: 12, left: 12, right: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  catChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catChipText: { color: '#FFF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  eventIconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  eventCardBody: { padding: 16 },
  eventDateLine: { fontSize: 12, fontWeight: '700', color: C.purple, letterSpacing: 0.5, marginBottom: 6 },
  eventCardTitle: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3, lineHeight: 26 },
  eventCardMeta: { color: C.textMuted, fontSize: 13, fontWeight: '500' },
  eventCardDesc: { color: C.textSub, fontSize: 13, lineHeight: 20, marginTop: 8 },
  detailsBtn: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bgSection, borderWidth: 0.5, borderColor: C.borderMid,
  },

  // ── Ticket card ──
  ticketStatusBar: { paddingHorizontal: 16, paddingVertical: 8 },
  ticketStatusText: { fontWeight: '700', fontSize: 14 },
  ticketTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8 },
  qrSection: {
    alignItems: 'center', marginTop: 20,
    backgroundColor: C.bgSection, borderRadius: 14, padding: 20,
    borderWidth: 0.5, borderColor: C.border, borderStyle: 'dashed',
  },
  qrLabel: { color: C.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 14 },
  qrFrame: { padding: 14, backgroundColor: C.bgCard, borderRadius: 14 },
  ticketIdPill: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20 },
  ticketIdText: { fontWeight: '800', fontSize: 14 },

  // ── Alert row ──
  alertRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bgCard, borderRadius: 12, padding: 14,
    borderWidth: 0.5, borderColor: C.border,
  },
  alertText: { color: C.text, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  alertDate: { color: C.textMuted, fontSize: 11, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.purple },

  // ── Profile ──
  profileHero: { alignItems: 'center', paddingTop: 32, paddingBottom: 28, paddingHorizontal: 20 },
  profileName: { fontSize: 22, fontWeight: '800', color: '#FFF', marginTop: 12, marginBottom: 4 },
  profileSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 12 },
  tierChip: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1,
  },
  statsRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: -20, padding: 0 },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statNum: { fontSize: 24, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 12, color: C.textMuted, marginTop: 2, fontWeight: '600' },

  // ── Progress ──
  progressTrack: { height: 6, backgroundColor: C.bgSection, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressHint: { color: C.textMuted, fontSize: 12, marginTop: 8 },

  // ── Badges ──
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badgeItem: { width: (SCREEN_W - 40 - 36) / 4, alignItems: 'center', gap: 5, position: 'relative' },
  badgeIconBox: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bgSection, borderWidth: 0.5, borderColor: C.border,
  },
  badgeName: { fontSize: 10, color: C.textSub, textAlign: 'center', fontWeight: '600' },
  badgeDot: {
    position: 'absolute', top: 0, right: 4,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.accentGreen, borderWidth: 1.5, borderColor: C.bgCard,
  },

  // ── History badges ──
  attendedBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  attendedBadgeText: { color: C.accentGreen, fontWeight: '700', fontSize: 11 },
  missedBadge: { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  missedBadgeText: { color: C.accentRed, fontWeight: '700', fontSize: 11 },
  deleteBtn: { padding: 8, borderRadius: 10, backgroundColor: '#FEF2F2' },

  // ── Settings ──
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  menuIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: C.bgSection },
  menuLabel: { flex: 1, fontSize: 15, color: C.text, fontWeight: '500' },
  logoutRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bgCard, borderWidth: 0.5, borderColor: '#FECACA',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  versionText: { textAlign: 'center', color: C.textMuted, fontSize: 12, marginTop: 24, marginBottom: 8 },

  // ── Calendar ──
  calNavBtn: { padding: 8, borderRadius: 10, backgroundColor: C.bgSection },
  calMonthLabel: { fontSize: 15, fontWeight: '700', color: C.text },
  calDayHeader: { width: '14.28%', textAlign: 'center', color: C.textMuted, fontSize: 11, fontWeight: '700' },
  calDayCell: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },

  // ── Modal ──
  modalNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: C.border,
    backgroundColor: C.bgCard,
  },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.bgSection, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: C.text, marginHorizontal: 8 },
  csvBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.bgSection },
  csvBtnText: { color: C.purple, fontWeight: '700', fontSize: 13 },
  modalHeroImg: { width: '100%', height: 200, borderRadius: 14, marginBottom: 4 },
  modalHeroPlaceholder: { width: '100%', height: 160, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalEventTitle: { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -0.5, marginBottom: 14 },
  modalMetaRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalMetaCard: { flex: 1, backgroundColor: C.bgSection, borderRadius: 12, padding: 14 },
  modalMetaCardLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 0.8, marginBottom: 6 },
  modalMetaCardValue: { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 20 },
  modalSectionLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 0.8, marginBottom: 10 },
  modalDesc: { color: C.textSub, fontSize: 15, lineHeight: 24 },

  // ── Q&A ──
  qaSection: { marginTop: 8 },
  qaDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.purple },
  qaBubble: {
    backgroundColor: C.bgSection, padding: 12, borderRadius: 12,
    marginBottom: 8, borderWidth: 0.5, borderColor: C.border, borderTopLeftRadius: 4,
  },
  qaBubbleSelf: { backgroundColor: C.purplePale, borderColor: C.borderMid, borderTopLeftRadius: 12, borderTopRightRadius: 4 },
  qaBubbleOrg: { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' },
  qaBubbleName: { fontWeight: '700', color: C.purple, marginBottom: 4, fontSize: 12 },
  qaBubbleMsg: { color: C.textSub, fontSize: 14, lineHeight: 20 },
  qaInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  qaInput: {
    flex: 1, backgroundColor: C.bgSection,
    borderWidth: 0.5, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 14,
  },
  qaSendBtn: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  // ── Organizer forms ──
  pageTitle: { fontSize: 24, fontWeight: '900', color: C.text, letterSpacing: -0.4 },
  pageSub: { fontSize: 14, color: C.textMuted, marginTop: 2, fontWeight: '500' },
  uploadArea: {
    borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', borderRadius: 14,
    padding: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16, minHeight: 100, overflow: 'hidden',
    backgroundColor: C.bgSection,
  },
  uploadIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  uploadPreview: { width: '100%', height: 140, borderRadius: 10 },
  datePicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bgSection, borderWidth: 0.5, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: C.bgSection, borderWidth: 0.5, borderColor: C.border,
  },
  actionChipDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  actionChipText: { fontWeight: '700', fontSize: 13, color: C.purple },
  fullActionBtn: {
    paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 10, overflow: 'hidden',
  },

  // ── Scanner ──
  scannerWrap: { width: 280, height: 280, borderRadius: 20, marginTop: 24, overflow: 'hidden', padding: 4 },
  scannerInner: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },

  // ── Stats chips ──
  statChipBox: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 0.5, overflow: 'hidden' },
  statChipNum: { fontWeight: '900', fontSize: 20 },
  statChipLabel: { color: C.textSub, fontSize: 11, fontWeight: '600', marginTop: 2 },

  // ── Admin ──
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  adminActionBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: C.bgSection, borderWidth: 0.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  verifyBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderColor: C.border },

  // ── Card typography ──
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardMeta: { fontSize: 13, color: C.textMuted, fontWeight: '500', marginBottom: 2 },
  emptyText: { color: C.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyStateTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 8 },
  emptyStateSub: { fontSize: 14, color: C.textMuted },

  // ── Pending App Styles (Admin) ──
  pendingAppHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, marginTop: 10 },
  pendingAppTitle: { fontSize: 24, fontWeight: '900', color: '#2D3142', letterSpacing: -0.5 },
  pendingBadge: { backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pendingBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  
  pendingCard: { 
    backgroundColor: '#F0E7FF', borderRadius: 24, padding: 24, marginBottom: 20, 
    position: 'relative', overflow: 'hidden', borderWidth: 1, borderColor: '#E9D5FF'
  },
  pendingDecorator: {
    position: 'absolute', top: -40, right: -40, width: 100, height: 100, 
    borderRadius: 50, backgroundColor: 'rgba(233, 213, 255, 0.5)'
  },
  pendingCatLabel: { fontSize: 10, fontWeight: '800', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 },
  pendingTitle: { fontSize: 20, fontWeight: '800', color: '#1E1B4B', marginBottom: 6 },
  pendingDesc: { fontSize: 14, color: '#4F46E5', opacity: 0.8, lineHeight: 20, marginBottom: 20 },
  
  approveActionRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  approvePrimaryBtn: { 
    flex: 1, height: 48, borderRadius: 24, backgroundColor: '#7C3AED', 
    alignItems: 'center', justifyContent: 'center', 
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
  },
  approvePrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  rejectSecondaryBtn: { 
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#E9D5FF', 
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D8B4FE'
  },
  
  // ── Active Card Styles (Admin) ──
  activeCard: {
    backgroundColor: '#F9F5FF', borderRadius: 24, padding: 20, marginBottom: 20,
    borderWidth: 1, borderColor: '#F3E8FF'
  },
  activeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  activeCardIconBox: {
    width: 48, height: 48, borderRadius: 16, backgroundColor: '#8B5CF6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
  },
  activeBadge: { backgroundColor: '#22D3EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  activeBadgeText: { color: '#083344', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  activeTitle: { fontSize: 20, fontWeight: '900', color: '#1E1B4B', marginBottom: 6, letterSpacing: -0.3 },
  activeDesc: { fontSize: 14, color: '#6B7280', lineHeight: 22, marginBottom: 16 },
  activeMetaRow: { flexDirection: 'row', gap: 24, marginBottom: 20 },
  activeMetaLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  activeMetaValue: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
  activeActionRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#F3E8FF', paddingTop: 16 },
  activeActionBtn: { alignItems: 'center', gap: 4 },
  activeActionText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
});