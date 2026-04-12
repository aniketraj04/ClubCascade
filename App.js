import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Image, FlatList, Modal, SafeAreaView,
  Animated, Dimensions, StatusBar, Platform, Share
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

// ─── Design Tokens ───────────────────────────────────────────────────
const COLORS = {
  bg: '#080B14',
  bgCard: '#0F1420',
  bgGlass: 'rgba(255,255,255,0.05)',
  bgGlassBorder: 'rgba(255,255,255,0.10)',
  accent1: '#7C3AED',
  accent2: '#EC4899',
  accent3: '#06B6D4',
  accent4: '#F59E0B',
  success: '#10B981',
  danger: '#EF4444',
  text: '#F1F5F9',
  textMuted: '#64748B',
  textSub: '#94A3B8',
  border: 'rgba(255,255,255,0.08)',
};

const GRAD_PURPLE = ['#7C3AED', '#EC4899'];
const GRAD_CYAN = ['#06B6D4', '#7C3AED'];
const GRAD_WARM = ['#F59E0B', '#EC4899'];
const GRAD_GREEN = ['#10B981', '#06B6D4'];

// ─── Category config ──────────────────────────────────────────────────
const CATEGORIES = [
  { label: 'All', icon: '✦', color: COLORS.accent1 },
  { label: 'General', icon: '🎯', color: '#7C3AED' },
  { label: 'Tech', icon: '💻', color: COLORS.accent3 },
  { label: 'Arts', icon: '🎨', color: '#EC4899' },
  { label: 'Sports', icon: '⚡', color: COLORS.accent4 },
  { label: 'Party', icon: '🔥', color: '#EF4444' },
  { label: 'Workshop', icon: '🛠', color: COLORS.success },
];

// ─── Badge Definitions ────────────────────────────────────────────────
// Each badge has: id, icon, name, desc, and a check(tickets) => bool function
const BADGE_DEFS = [
  {
    id: 'first_event',
    icon: '🎯',
    name: 'First step',
    desc: 'Attended your first event',
    check: (tickets) => tickets.filter(t => t.attended === 1).length >= 1,
  },
  {
    id: 'streak_5',
    icon: '⚡',
    name: '5-streak',
    desc: 'Attended 5 events',
    check: (tickets) => tickets.filter(t => t.attended === 1).length >= 5,
  },
  {
    id: 'streak_10',
    icon: '🌟',
    name: '10 events',
    desc: 'Attended 10 events total',
    check: (tickets) => tickets.filter(t => t.attended === 1).length >= 10,
  },
  {
    id: 'tech_head',
    icon: '💻',
    name: 'Tech head',
    desc: 'Attended 3 Tech events',
    check: (tickets) => tickets.filter(t => t.attended === 1 && t.category === 'Tech').length >= 3,
  },
  {
    id: 'early_bird',
    icon: '🚀',
    name: 'Early bird',
    desc: 'Registered within 1hr of event post',
    check: (tickets) => tickets.some(t => t.early_bird === true),
  },
  {
    id: 'all_cats',
    icon: '🎪',
    name: 'Explorer',
    desc: 'Attended events in 4+ categories',
    check: (tickets) => {
      const cats = new Set(tickets.filter(t => t.attended === 1).map(t => t.category));
      return cats.size >= 4;
    },
  },
  {
    id: 'gold_tier',
    icon: '🏆',
    name: 'Gold tier',
    desc: 'Attended 8 events',
    check: (tickets) => tickets.filter(t => t.attended === 1).length >= 8,
  },
  {
    id: 'legend',
    icon: '👑',
    name: 'Legend',
    desc: 'Attended 15 events',
    check: (tickets) => tickets.filter(t => t.attended === 1).length >= 15,
  },
];

// Computes streak: consecutive attended events (sorted by date desc)
function computeStreak(tickets) {
  const attended = tickets
    .filter(t => t.attended === 1)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return attended.length; // simple count for now; can be made calendar-based later
}

// ─── Shared UI Components ────────────────────────────────────────────

const GlowDot = ({ color = COLORS.accent1, size = 200, style }) => (
  <View pointerEvents="none" style={[{
    position: 'absolute', width: size, height: size, borderRadius: size / 2,
    backgroundColor: color, opacity: 0.15,
    shadowColor: color, shadowRadius: size / 3, shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
  }, style]} />
);

const GradientButton = ({ onPress, colors = GRAD_PURPLE, label, icon, style, disabled }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress && onPress();
  };
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity onPress={press} disabled={disabled} activeOpacity={0.9}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.gradBtn}>
          {icon ? <Text style={{ fontSize: 18, marginRight: 8 }}>{icon}</Text> : null}
          <Text style={styles.gradBtnText}>{disabled ? 'Please wait...' : label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

const GlassCard = ({ children, style, onPress }) => {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} activeOpacity={0.85} style={[styles.glassCard, style]}>
      {children}
    </Wrapper>
  );
};

const GlassInput = ({ style, ...props }) => (
  <TextInput
    placeholderTextColor={COLORS.textMuted}
    style={[styles.glassInput, style]}
    {...props}
  />
);

const CategoryPill = ({ label, active, onPress, color }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8}
    style={[styles.pill, active && { borderColor: color || COLORS.accent1 }]}>
    {active
      ? <LinearGradient colors={color ? [color, color + 'AA'] : GRAD_PURPLE}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill} borderRadius={20} />
      : null}
    <Text style={[styles.pillText, active && { color: '#FFF' }]}>{label}</Text>
  </TouchableOpacity>
);

const TabBar = ({ tabs, active, onChange }) => (
  <View style={styles.tabBar}>
    {tabs.map(t => {
      const isActive = active === t.key;
      return (
        <TouchableOpacity key={t.key} onPress={() => onChange(t.key)}
          style={styles.tabItem} activeOpacity={0.7}>
          {/* Active indicator dot */}
          <View style={styles.tabIconWrap}>
            {isActive && (
              <LinearGradient colors={GRAD_PURPLE}
                style={StyleSheet.absoluteFill} borderRadius={16} />
            )}
            <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>{t.icon}</Text>
            {/* Unread badge */}
            {t.badge ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{t.badge > 9 ? '9+' : t.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ─── Initials Avatar ─────────────────────────────────────────────────
const InitialsAvatar = ({ name = '', size = 72, fontSize = 26 }) => {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, padding: 3 }}>
      <LinearGradient colors={GRAD_PURPLE} style={{ flex: 1, borderRadius: size / 2 + 3 }}>
        <View style={{
          flex: 1, borderRadius: size / 2,
          margin: 3, backgroundColor: '#1a1040',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#FFF', fontSize, fontWeight: '700' }}>{initials}</Text>
        </View>
      </LinearGradient>
    </View>
  );
};

// ─── Section 1: LOGIN SCREEN ──────────────────────────────────────────
function LoginScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('student');
  
  // Organizer specific fields
  const [phone, setPhone] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubRole, setClubRole] = useState('');
  const [department, setDepartment] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studyYear, setStudyYear] = useState('');

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const CLUB_ROLES = ['President', 'Vice President', 'Coordinator', 'Core Member'];
  const DEPARTMENTS = ['Computer Science', 'Mechanical', 'Electronics', 'Business', 'Arts'];
  const STUDY_YEARS = ['1st Year', '2nd Year', '3rd Year', 'Final Year'];
  const CLUB_NAMES = ['Tech Society', 'E-Sports', 'Robotics', 'Debate', 'Music Club'];

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const API_URL = 'http://10.191.188.100:3000/api';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleAuthentication = async () => {
    if (!email || !password || (!isLoginMode && !name)) {
      Alert.alert('Hold on!', 'Please fill out all basic fields.');
      return;
    }
    if (!isLoginMode && password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match!');
      return;
    }
    if (!isLoginMode && role === 'organizer') {
       if (!phone || !clubName || !clubRole || !department || !studentId || !studyYear) {
          Alert.alert('Hold on!', 'All Organizer Verification details are strictly required!');
          return;
       }
    }
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}${isLoginMode ? '/login' : '/signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isLoginMode 
             ? { email, password } 
             : { name, email, password, role, phone, club_name: clubName, club_role: clubRole, department, student_id: studentId, study_year: studyYear }
        ),
      });
      const data = await response.json();
      if (data.success) {
        if (isLoginMode) {
          if (data.user.role === 'student')
            navigation.replace('Student', { userName: data.user.name, userId: data.user.id });
          else if (data.user.role === 'admin')
            navigation.replace('Admin', { userName: data.user.name, userId: data.user.id });
          else
            navigation.replace('Organizer', { userName: data.user.name, userId: data.user.id });
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
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />
      <GlowDot color={COLORS.accent1} size={350} style={{ top: -80, left: -80 }} />
      <GlowDot color={COLORS.accent2} size={250} style={{ bottom: 100, right: -60 }} />

      <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          alignItems: 'center', width: '100%',
        }}>
          <View style={styles.logoMark}>
            <LinearGradient colors={GRAD_PURPLE} style={StyleSheet.absoluteFill} borderRadius={24} />
            <Text style={{ fontSize: 36 }}>🎪</Text>
          </View>

          <Text style={styles.appName}>ClubCascade</Text>
          <Text style={styles.appTagline}>Your college's event universe</Text>

          <GlassCard style={{ width: '100%', marginTop: 32 }}>
            <Text style={styles.formHeading}>
              {isLoginMode ? 'Welcome back 👋' : 'Join the crew 🚀'}
            </Text>

            {!isLoginMode && (
              <GlassInput placeholder="Full Name" value={name} onChangeText={setName} />
            )}
            <GlassInput
              placeholder="College Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <GlassInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            
            {!isLoginMode && (
              <GlassInput
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            )}

            {!isLoginMode && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.labelText}>I am joining as:</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  {['student', 'organizer'].map(r => (
                    <TouchableOpacity key={r} onPress={() => setRole(r)}
                      style={[styles.roleBtn, role === r && styles.roleBtnActive]}
                      activeOpacity={0.8}>
                      {role === r && (
                        <LinearGradient colors={GRAD_PURPLE}
                          style={StyleSheet.absoluteFill} borderRadius={12} />
                      )}
                      <Text style={{ fontSize: 20 }}>{r === 'student' ? '🎓' : '🎛️'}</Text>
                      <Text style={[styles.roleBtnText, role === r && { color: '#FFF' }]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!isLoginMode && role === 'organizer' && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.labelText, { color: COLORS.accent1, fontSize: 16, marginBottom: 12 }]}>🚀 Verification Required</Text>
                
                <GlassInput placeholder="Phone Number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
                <GlassInput placeholder="Student ID / Enrollment No." value={studentId} onChangeText={setStudentId} />
                
                <Text style={styles.labelText}>Club Name</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {CLUB_NAMES.map(c => (
                    <CategoryPill key={c} label={c} active={clubName === c} onPress={() => setClubName(c)} color={COLORS.accent1} />
                  ))}
                </ScrollView>

                <Text style={styles.labelText}>Club Role</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {CLUB_ROLES.map(c => (
                    <CategoryPill key={c} label={c} active={clubRole === c} onPress={() => setClubRole(c)} color={COLORS.accent2} />
                  ))}
                </ScrollView>

                <Text style={styles.labelText}>Department</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {DEPARTMENTS.map(c => (
                    <CategoryPill key={c} label={c} active={department === c} onPress={() => setDepartment(c)} color={COLORS.accent3} />
                  ))}
                </ScrollView>
                
                <Text style={styles.labelText}>Year of Study</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {STUDY_YEARS.map(c => (
                    <CategoryPill key={c} label={c} active={studyYear === c} onPress={() => setStudyYear(c)} color={COLORS.success} />
                  ))}
                </ScrollView>
              </View>
            )}

            <GradientButton
              onPress={handleAuthentication}
              disabled={isLoading}
              label={isLoginMode ? 'Log In' : 'Create Account'}
              colors={GRAD_PURPLE}
              style={{ marginTop: 4 }}
            />
          </GlassCard>

          <TouchableOpacity
            onPress={() => setIsLoginMode(!isLoginMode)}
            style={{ marginTop: 24, padding: 8 }}>
            <Text style={styles.switchText}>
              {isLoginMode ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: COLORS.accent2, fontWeight: '700' }}>
                {isLoginMode ? 'Sign up' : 'Log in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Section 2: PROFILE SCREEN ────────────────────────────────────────
function ProfileScreen({ userName, userId, tickets, savedEventIds = [], onToggleWishlist, navigation }) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [wishlistEvents, setWishlistEvents] = useState([]);
  const API_URL = 'http://10.191.188.100:3000/api';

  useEffect(() => {
    if (userId) {
      fetch(`${API_URL}/wishlist/${userId}/events`)
        .then(r => r.json())
        .then(d => { if (d.success) setWishlistEvents(d.events); })
        .catch(() => {});
    }
  }, [userId, savedEventIds.length]);

  const attendedTickets = tickets.filter(t => t.attended === 1);
  const pastTickets = tickets.filter(t => t.attended === 1 || new Date(t.date) < new Date()).sort((a,b) => new Date(b.date) - new Date(a.date));
  const upcomingTickets = tickets.filter(t => t.attended !== 1 && new Date(t.date) > new Date());
  const streak = computeStreak(tickets);

  // Tier thresholds
  const getTier = (count) => {
    if (count >= 15) return { label: 'Legend 👑', color: '#F59E0B', next: null, needed: 0 };
    if (count >= 8) return { label: 'Gold 🏆', color: '#F59E0B', next: 'Legend', needed: 15 - count };
    if (count >= 5) return { label: 'Silver ⚡', color: '#94A3B8', next: 'Gold', needed: 8 - count };
    if (count >= 1) return { label: 'Bronze 🎯', color: '#CD7F32', next: 'Silver', needed: 5 - count };
    return { label: 'Newcomer', color: COLORS.textMuted, next: 'Bronze', needed: 1 };
  };
  const tier = getTier(attendedTickets.length);

  // Compute earned badges
  const badges = BADGE_DEFS.map(b => ({ ...b, earned: b.check(tickets) }));

  const INTERESTS = ['💻 Tech', '🎨 Arts', '🔥 Party', '⚡ Sports', '🎯 General', '🛠 Workshop'];

  const handleLogout = () => {
    Alert.alert('Log out?', 'See you next time 👋', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => navigation.replace('Login') },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}>

      {/* ── Hero ── */}
      <View style={styles.profileHero}>
        <InitialsAvatar name={userName} size={80} fontSize={30} />
        <Text style={styles.profileName}>{userName}</Text>
        <View style={[styles.tierBadge, { borderColor: tier.color + '60', backgroundColor: tier.color + '18' }]}>
          <Text style={[styles.tierBadgeText, { color: tier.color }]}>{tier.label}</Text>
        </View>
        <View style={styles.interestRow}>
          {INTERESTS.slice(0, 3).map(i => (
            <View key={i} style={styles.interestPill}>
              <Text style={styles.interestPillText}>{i}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Stats Row ── */}
      <View style={styles.statsRow}>
        {[
          { num: attendedTickets.length, label: 'Attended' },
          { num: upcomingTickets.length, label: 'Upcoming' },
          { num: streak, label: '🔥 Streak' },
        ].map((s, i) => (
          <View key={i} style={[
            styles.statCell,
            i < 2 && { borderRightWidth: 0.5, borderRightColor: COLORS.border },
          ]}>
            <Text style={styles.statNum}>{s.num}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Streak / Tier Progress Banner ── */}
      {tier.next && (
        <View style={styles.streakBanner}>
          <Text style={{ fontSize: 24 }}>🔥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.streakBannerTitle}>
              {tier.needed} more event{tier.needed !== 1 ? 's' : ''} to reach {tier.next}!
            </Text>
            <View style={styles.progressBg}>
              <LinearGradient
                colors={GRAD_WARM}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.progressFill, {
                  width: `${Math.min(
                    100,
                    (attendedTickets.length / (attendedTickets.length + tier.needed)) * 100
                  )}%`,
                }]}
              />
            </View>
          </View>
        </View>
      )}

      {/* ── Badges ── */}
      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>BADGES</Text>
        <View style={styles.badgesGrid}>
          {badges.map(b => (
            <View key={b.id} style={styles.badgeItem}>
              <View style={[styles.badgeIcon, b.earned ? styles.badgeIconEarned : styles.badgeIconLocked]}>
                {b.earned && (
                  <LinearGradient
                    colors={[COLORS.accent1 + '40', COLORS.accent2 + '40']}
                    style={StyleSheet.absoluteFill}
                    borderRadius={14}
                  />
                )}
                <Text style={[{ fontSize: 22 }, !b.earned && { opacity: 0.3 }]}>{b.icon}</Text>
              </View>
              <Text style={[styles.badgeName, !b.earned && { opacity: 0.35 }]}>{b.name}</Text>
              {b.earned && (
                <View style={styles.badgeEarnedDot} />
              )}
            </View>
          ))}
        </View>
      </View>

      {/* ── Wishlist / Saved Events ── */}
      <View style={styles.profileSection}>
        <TouchableOpacity
          onPress={() => setIsWishlistOpen(!isWishlistOpen)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[styles.profileSectionTitle, { marginBottom: 0 }]}>🔖 SAVED EVENTS</Text>
          <Text style={{ color: COLORS.accent2, fontSize: 16, fontWeight: '600' }}>{isWishlistOpen ? 'Hide' : `Show (${wishlistEvents.length})`}</Text>
        </TouchableOpacity>

        {isWishlistOpen && (
          wishlistEvents.length === 0 ? (
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 12 }}>No saved events yet. Tap 🏷️ on any event to bookmark it!</Text>
          ) : (
            wishlistEvents.map((e, idx) => (
              <GlassCard key={idx} style={{ marginBottom: 10, padding: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700' }}>{e.title}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4 }}>
                      📅 {new Date(e.date).toLocaleDateString()} • 📍 {e.venue}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => onToggleWishlist && onToggleWishlist(e.event_id)}
                    style={{ padding: 8, borderRadius: 16, backgroundColor: COLORS.danger + '20' }}>
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            ))
          )
        )}
      </View>

      {/* ── Event History ── */}
      {pastTickets.length > 0 && (
        <View style={styles.profileSection}>
          <TouchableOpacity 
            onPress={() => setIsHistoryOpen(!isHistoryOpen)} 
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.profileSectionTitle, { marginBottom: 0 }]}>EVENT HISTORY</Text>
            <Text style={{ color: COLORS.accent1, fontSize: 16, fontWeight: '600' }}>{isHistoryOpen ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
          
          {isHistoryOpen && pastTickets.map((t, idx) => (
            <GlassCard key={idx} style={{ marginBottom: 8, padding: 12, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700' }}>{t.title}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4 }}>
                  {new Date(t.date).toLocaleDateString()} • {t.venue}
                </Text>
              </View>
              {t.attended === 1 ? (
                <Text style={{ fontSize: 24 }}>✅</Text>
              ) : (
                <View style={{ backgroundColor: COLORS.danger + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.danger + '80' }}>
                  <Text style={{ color: COLORS.danger, fontWeight: '800', fontSize: 10 }}>MISSED</Text>
                </View>
              )}
            </GlassCard>
          ))}
        </View>
      )}

      {/* ── Settings Menu ── */}
      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>SETTINGS</Text>
        <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
          {[
            { icon: '🔔', label: 'Notifications', color: COLORS.accent1 + '25', onPress: () => { } },
            { icon: '🎯', label: 'My interests', color: COLORS.accent3 + '25', onPress: () => { } },
            { icon: '🔒', label: 'Change password', color: COLORS.success + '25', onPress: () => { } },
          ].map((item, idx, arr) => (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              activeOpacity={0.7}
              style={[
                styles.menuItem,
                idx < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
              ]}>
              <View style={[styles.menuIconBox, { backgroundColor: item.color }]}>
                <Text style={{ fontSize: 16 }}>{item.icon}</Text>
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </GlassCard>
      </View>

      {/* ── Log Out (lives here now, nowhere else) ── */}
      <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
        <TouchableOpacity onPress={handleLogout} activeOpacity={0.8} style={styles.logoutRow}>
          <View style={[styles.menuIconBox, { backgroundColor: COLORS.danger + '20' }]}>
            <Text style={{ fontSize: 16 }}>🚪</Text>
          </View>
          <Text style={[styles.menuLabel, { color: COLORS.danger }]}>Log out</Text>
          <Text style={[styles.menuArrow, { color: COLORS.danger }]}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.versionText}>ClubCascade v2.0 · Made with ❤️</Text>
    </ScrollView>
  );
}

// ─── Calendar Mini View ──────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['S','M','T','W','T','F','S'];

function CalendarMiniView({ events, selectedDate, onSelectDate }) {
  const [displayMonth, setDisplayMonth] = useState(new Date());

  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map each day to its event categories for colored dots
  const dayEventMap = {};
  events.forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!dayEventMap[day]) dayEventMap[day] = [];
      dayEventMap[day].push(e.category || 'General');
    }
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const isSelected = (d) => d && selectedDate &&
    selectedDate.getDate() === d && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;

  const getCategoryColor = (cat) => {
    const found = CATEGORIES.find(c => c.label === cat);
    return found ? found.color : COLORS.accent1;
  };

  return (
    <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
      {/* Month nav */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity onPress={() => setDisplayMonth(new Date(year, month - 1, 1))}
          style={{ padding: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '800' }}>{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity onPress={() => setDisplayMonth(new Date(year, month + 1, 1))}
          style={{ padding: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {DAY_LABELS.map((d, i) => (
          <Text key={i} style={{ width: '14.28%', textAlign: 'center', color: COLORS.textMuted, fontSize: 11, fontWeight: '700' }}>{d}</Text>
        ))}
      </View>

      {/* Day cells */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          const dots = day ? (dayEventMap[day] || []) : [];
          const sel = isSelected(day);
          const tod = isToday(day);
          return (
            <TouchableOpacity key={i}
              onPress={() => { if (!day) return; const nd = new Date(year, month, day); onSelectDate(sel ? null : nd); }}
              style={{ width: '14.28%', alignItems: 'center', paddingVertical: 4 }}
              activeOpacity={0.7}>
              <View style={[
                { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
                sel && { backgroundColor: COLORS.accent1 },
                !sel && tod && { borderWidth: 1.5, borderColor: COLORS.accent1 },
              ]}>
                <Text style={{ color: day ? (sel ? '#FFF' : COLORS.text) : 'transparent', fontSize: 13, fontWeight: tod ? '800' : '500' }}>{day || ''}</Text>
              </View>
              {/* Event dots (max 3) */}
              <View style={{ flexDirection: 'row', gap: 2, marginTop: 2, height: 6 }}>
                {dots.slice(0, 3).map((cat, di) => (
                  <View key={di} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: getCategoryColor(cat) }} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedDate && (
        <TouchableOpacity onPress={() => onSelectDate(null)}
          style={{ marginTop: 10, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>✕ Clear filter</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Section 3: STUDENT DASHBOARD ────────────────────────────────────
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

  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventQueries, setEventQueries] = useState([]);
  const [newQueryMessage, setNewQueryMessage] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const API_URL = 'http://10.191.188.100:3000/api';
  const SOCKET_URL = 'http://10.191.188.100:3000';

  useEffect(() => {
    fetchNotifications();
    const socket = io(SOCKET_URL);
    socket.on('new_event_alert', (data) => {
      Alert.alert('🚨 Live Drop!', data.message);
      fetchNotifications();
    });
    socket.on('new_event_query', (newQuery) => {
      setEventQueries(prev => [...prev, newQuery]);
    });
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (viewMode === 'events') fetchEvents();
    else if (viewMode === 'tickets') fetchMyTickets();
    else if (viewMode === 'alerts') fetchNotifications();
    // 'profile' tab uses already-fetched myTickets — no extra fetch needed
  }, [viewMode]);

  // Always keep tickets fresh so profile badges are accurate
  useEffect(() => { fetchMyTickets(); fetchWishlist(); }, []);

  const fetchNotifications = async () => {
    try {
      const r = await fetch(`${API_URL}/notifications/${userId}`);
      const d = await r.json();
      if (d.success) {
        setNotifications(d.notifications);
        setUnreadCount(d.notifications.filter(n => !n.is_read).length);
      }
    } catch (_) { }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await fetch(`${API_URL}/notifications/read/${id}`, { method: 'POST' });
      fetchNotifications();
    } catch (_) { }
  };

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}/events`);
      const d = await r.json();
      if (d.success) {
        const publishedEvents = d.events.filter(e => e.status !== 'pending');
        setEvents(publishedEvents);
      }
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

  const handleToggleWishlist = async (eventId) => {
    try {
      const r = await fetch(`${API_URL}/wishlist/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, event_id: eventId }),
      });
      const d = await r.json();
      if (d.success) {
        setSavedEventIds(prev =>
          d.saved ? [...prev, eventId] : prev.filter(id => id !== eventId)
        );
      }
    } catch (_) { }
  };

  const handleShareEvent = async (item) => {
    try {
      const dateStr = new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      await Share.share({
        title: item.title,
        message: `🎪 ${item.title}\n\n📅 ${dateStr}\n📍 ${item.venue}\n\n${item.description ? item.description + '\n\n' : ''}Check it out on ClubCascade!`,
      });
    } catch (_) { }
  };

  const fetchMyTickets = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}/tickets/${userId}`);
      const d = await r.json();
      if (d.success) setMyTickets(d.tickets);
    } catch (_) { Alert.alert('Error', 'Could not load tickets.'); }
    finally { setIsLoading(false); }
  };

  const handleRegister = async (eventId) => {
    try {
      const r = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, event_id: eventId }),
      });
      const d = await r.json();
      Alert.alert(d.success ? "You're In! 🎉" : 'Heads up', d.message);
      if (d.success) fetchMyTickets();
    } catch (_) { Alert.alert('Error', 'Could not register.'); }
  };

  const handleCancelRegistration = (regId) => {
    Alert.alert('Cancel Ticket?', 'Your spot will be permanently lost.', [
      { text: 'Nevermind', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive',
        onPress: async () => {
          try {
            const r = await fetch(`${API_URL}/cancel-registration/${regId}`, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) { Alert.alert('Withdrawn', d.message); fetchMyTickets(); }
            else Alert.alert('Error', d.message);
          } catch (_) { Alert.alert('Error', 'Server unreachable.'); }
        },
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
      const r = await fetch(`${API_URL}/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedEvent.event_id,
          user_id: userId,
          user_name: userName,
          message: newQueryMessage,
        }),
      });
      const d = await r.json();
      if (d.success) setNewQueryMessage('');
    } catch (_) { }
  };

  const getCategoryColor = (cat) => {
    const found = CATEGORIES.find(c => c.label === cat);
    return found ? found.color : COLORS.accent1;
  };

  const filteredEvents = events.filter(e => {
    const matchCat = selectedCategory === 'All' || e.category === selectedCategory;
    const matchSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchDate = !selectedCalDate ||
      (new Date(e.date).toDateString() === selectedCalDate.toDateString());
    return matchCat && matchSearch && matchDate;
  });

  // ── Render: Event Card ──
  const renderEvent = ({ item }) => {
    const catColor = getCategoryColor(item.category);
    const isSaved = savedEventIds.includes(item.event_id);
    return (
      <TouchableOpacity onPress={() => openEventDetails(item)} activeOpacity={0.9}
        style={[styles.eventCard, { borderColor: catColor + '30' }]}>
        <LinearGradient colors={[catColor, catColor + '00']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.eventCardAccent} />
        {item.image_url
          ? <Image source={{ uri: item.image_url }} style={styles.eventCardImg} resizeMode="cover" />
          : (
            <LinearGradient colors={[catColor + '30', COLORS.bgCard]}
              style={styles.eventCardImgPlaceholder}>
              <Text style={{ fontSize: 48 }}>
                {CATEGORIES.find(c => c.label === item.category)?.icon || '🎪'}
              </Text>
            </LinearGradient>
          )
        }
        <View style={styles.eventCardBody}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={[styles.catBadge, { backgroundColor: catColor + '20', borderColor: catColor + '60' }]}>
              <Text style={[styles.catBadgeText, { color: catColor }]}>
                {CATEGORIES.find(c => c.label === item.category)?.icon} {item.category || 'General'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation && e.stopPropagation(); handleShareEvent(item); }}
                style={{ padding: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' }}
                activeOpacity={0.7}>
                <Text style={{ fontSize: 16 }}>🔗</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation && e.stopPropagation(); handleToggleWishlist(item.event_id); }}
                style={{ padding: 6, borderRadius: 20, backgroundColor: isSaved ? COLORS.accent1 + '25' : 'rgba(255,255,255,0.1)' }}
                activeOpacity={0.7}>
                <Text style={{ fontSize: 16 }}>{isSaved ? '🔖' : '🏷️'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.eventCardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.eventCardMeta}>
            <Text style={styles.eventCardMetaText}>
              📅 {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </Text>
            <Text style={styles.eventCardMetaText}>📍 {item.venue}</Text>
          </View>
          {item.description
            ? <Text style={styles.eventCardDesc} numberOfLines={2}>{item.description}</Text>
            : null}
          <GradientButton
            onPress={() => handleRegister(item.event_id)}
            label="Register Now"
            colors={[catColor, catColor + 'BB']}
            style={{ marginTop: 14 }}
          />
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render: Ticket Card ──
  const renderTicket = ({ item }) => {
    const past = new Date(item.date) < new Date();
    const statusConfig = item.attended === 1
      ? { label: '✅ Verified', colors: [COLORS.success, '#059669'], }
      : past
        ? { label: '❌ Missed', colors: [COLORS.danger, '#DC2626'], }
        : { label: '🎟️ Upcoming', colors: [COLORS.accent3, COLORS.accent1], };

    return (
      <GlassCard style={{ marginBottom: 16, overflow: 'hidden' }}>
        {item.image_url
          ? <Image source={{ uri: item.image_url }} style={styles.ticketImg} resizeMode="cover" />
          : null}
        <LinearGradient colors={statusConfig.colors}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.ticketRibbon}>
          <Text style={styles.ticketRibbonText}>{statusConfig.label}</Text>
        </LinearGradient>
        <View style={{ padding: 20 }}>
          <Text style={styles.ticketTitle}>{item.title}</Text>
          <Text style={styles.ticketMeta}>
            📅 {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </Text>
          <Text style={styles.ticketMeta}>📍 {item.venue}</Text>
          <View style={styles.qrSection}>
            <Text style={styles.qrLabel}>Show at the door</Text>
            <View style={styles.qrFrame}>
              <QRCode
                value={item.registration_id.toString()}
                size={160}
                color={COLORS.accent1}
                backgroundColor="transparent"
              />
            </View>
            <View style={styles.ticketIdBadge}>
              <LinearGradient colors={GRAD_PURPLE}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill} borderRadius={20} />
              <Text style={styles.ticketIdText}>Ticket #{item.registration_id}</Text>
            </View>
          </View>
          <GradientButton
            onPress={() => handleCancelRegistration(item.registration_id)}
            label="Withdraw Ticket"
            colors={[COLORS.danger, '#DC2626']}
            style={{ marginTop: 12 }}
          />
        </View>
      </GlassCard>
    );
  };

  // ── Render: Alert Card ──
  const renderAlert = ({ item }) => (
    <TouchableOpacity
      onPress={() => handleMarkAsRead(item.notification_id)}
      style={[styles.alertCard, !item.is_read && styles.alertCardUnread]}
      activeOpacity={0.8}>
      {!item.is_read && <LinearGradient colors={[COLORS.accent2, COLORS.accent1]}
        style={styles.alertUnreadBar} />}
      <View style={{ flex: 1, paddingLeft: !item.is_read ? 12 : 0 }}>
        <Text style={styles.alertText}>{item.message}</Text>
        <Text style={styles.alertDate}>
          {new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
        </Text>
      </View>
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  // ── Tab definitions (Profile tab added, no logout button anywhere else) ──
  const STUDENT_TABS = [
    { key: 'events', icon: '✦', label: 'Discover' },
    { key: 'tickets', icon: '🎟', label: 'Tickets' },
    { key: 'alerts', icon: '🔔', label: 'Alerts', badge: unreadCount > 0 ? unreadCount : null },
    { key: 'profile', icon: '👤', label: 'Profile' },
  ];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <GlowDot color={COLORS.accent1} size={300} style={{ top: -60, right: -60 }} />
      <GlowDot color={COLORS.accent2} size={200} style={{ bottom: 200, left: -60 }} />

      {/* ── Header (hidden on Profile since ProfileScreen has its own top) ── */}
      {viewMode !== 'profile' && (
        <View style={styles.screenHeader}>
          <View>
            <Text style={styles.screenHeaderSub}>Hey, {userName.split(' ')[0]} 👋</Text>
            <Text style={styles.screenHeaderTitle}>Student Hub</Text>
          </View>
          <TouchableOpacity onPress={() => setViewMode('profile')} activeOpacity={0.8}>
            <InitialsAvatar name={userName} size={38} fontSize={14} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Profile Tab ── */}
      {viewMode === 'profile' && (
        <ProfileScreen
          userName={userName}
          userId={userId}
          tickets={myTickets}
          savedEventIds={savedEventIds}
          onToggleWishlist={handleToggleWishlist}
          navigation={navigation}
        />
      )}

      {/* ── Filters (Discover only) ── */}
      {viewMode === 'events' && (
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <View style={[styles.searchBar, { flex: 1, marginBottom: 0 }]}>
              <Text style={{ color: COLORS.textMuted, marginRight: 8, fontSize: 16 }}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search events..."
                placeholderTextColor={COLORS.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <TouchableOpacity
              onPress={() => { setIsCalendarOpen(p => !p); if (isCalendarOpen) setSelectedCalDate(null); }}
              style={{ marginLeft: 10, padding: 10, borderRadius: 12,
                backgroundColor: isCalendarOpen ? COLORS.accent1 + '30' : 'rgba(255,255,255,0.08)',
                borderWidth: 1, borderColor: isCalendarOpen ? COLORS.accent1 + '80' : 'transparent' }}>
              <Text style={{ fontSize: 18 }}>📅</Text>
            </TouchableOpacity>
          </View>

          {isCalendarOpen && (
            <CalendarMiniView
              events={events}
              selectedDate={selectedCalDate}
              onSelectDate={setSelectedCalDate}
            />
          )}

          {selectedCalDate && !isCalendarOpen && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: COLORS.accent1, fontSize: 13 }}>📅 {selectedCalDate.toDateString()}</Text>
              <TouchableOpacity onPress={() => setSelectedCalDate(null)} style={{ marginLeft: 8 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>✕ Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {CATEGORIES.map(cat => (
              <CategoryPill
                key={cat.label}
                label={cat.icon + ' ' + cat.label}
                active={selectedCategory === cat.label}
                onPress={() => setSelectedCategory(cat.label)}
                color={cat.color}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── List content ── */}
      {viewMode !== 'profile' && (
        isLoading
          ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={COLORS.accent1} />
              <Text style={{ color: COLORS.textMuted, marginTop: 12, fontSize: 15 }}>Loading...</Text>
            </View>
          )
          : (
            <FlatList
              data={
                viewMode === 'events' ? filteredEvents :
                  viewMode === 'tickets' ? myTickets.filter(t => !t.attended) :
                    notifications
              }
              keyExtractor={item =>
                viewMode === 'events' ? item.event_id.toString() :
                  viewMode === 'tickets' ? item.registration_id.toString() :
                    item.notification_id.toString()
              }
              renderItem={
                viewMode === 'events' ? renderEvent :
                  viewMode === 'tickets' ? renderTicket :
                    renderAlert
              }
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 56, marginBottom: 16 }}>
                    {viewMode === 'events' ? '🎪' : viewMode === 'tickets' ? '🎟️' : '🔔'}
                  </Text>
                  <Text style={styles.emptyText}>
                    {viewMode === 'events' ? 'No events found' :
                      viewMode === 'tickets' ? 'No tickets yet' :
                        'Inbox is empty'}
                  </Text>
                </View>
              }
            />
          )
      )}

      {/* ── Bottom Tab Bar (Instagram-style) ── */}
      <TabBar tabs={STUDENT_TABS} active={viewMode} onChange={setViewMode} />

      {/* ── Event Details Modal ── */}
      {selectedEvent && (
        <Modal
          visible={isDetailsModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setIsDetailsModalVisible(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
            <GlowDot color={getCategoryColor(selectedEvent.category)} size={250}
              style={{ top: -60, right: -40 }} />

            <View style={styles.modalNav}>
              <TouchableOpacity onPress={() => setIsDetailsModalVisible(false)}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalNavTitle} numberOfLines={1}>{selectedEvent.title}</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}>
              {selectedEvent.image_url
                ? <Image source={{ uri: selectedEvent.image_url }}
                  style={styles.modalHeroImg} resizeMode="cover" />
                : (
                  <LinearGradient
                    colors={[getCategoryColor(selectedEvent.category) + '50', COLORS.bgCard]}
                    style={styles.modalHeroPlaceholder}>
                    <Text style={{ fontSize: 64 }}>
                      {CATEGORIES.find(c => c.label === selectedEvent.category)?.icon || '🎪'}
                    </Text>
                  </LinearGradient>
                )
              }

              <Text style={styles.modalEventTitle}>{selectedEvent.title}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <View style={styles.modalMetaPill}>
                  <Text style={styles.modalMetaText}>
                    📅 {new Date(selectedEvent.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </Text>
                </View>
                <View style={styles.modalMetaPill}>
                  <Text style={styles.modalMetaText}>📍 {selectedEvent.venue}</Text>
                </View>
              </View>

              {selectedEvent.description
                ? <Text style={styles.modalDesc}>{selectedEvent.description}</Text>
                : null}

              <GradientButton
                onPress={() => handleRegister(selectedEvent.event_id)}
                label="Register Instantly"
                colors={GRAD_PURPLE}
                icon="🎟"
                style={{ marginTop: 20, marginBottom: 32 }}
              />

              {/* Live Q&A */}
              <View style={styles.qaSection}>
                <View style={styles.qaSectionHeader}>
                  <LinearGradient colors={GRAD_CYAN}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.qaSectionDot} />
                  <Text style={styles.qaSectionTitle}>Live Q&A Board</Text>
                </View>

                {eventQueries.map((q, i) => (
                  <View key={i} style={[
                    styles.qaBubble,
                    q.user_name === userName && styles.qaBubbleSelf,
                  ]}>
                    <Text style={styles.qaBubbleName}>{q.user_name}</Text>
                    <Text style={styles.qaBubbleMsg}>{q.message}</Text>
                  </View>
                ))}

                <View style={styles.qaInputRow}>
                  <TextInput
                    style={styles.qaInput}
                    placeholder="Ask something..."
                    placeholderTextColor={COLORS.textMuted}
                    value={newQueryMessage}
                    onChangeText={setNewQueryMessage}
                  />
                  <TouchableOpacity onPress={handlePostQuery} style={styles.qaSendBtn}>
                    <LinearGradient colors={GRAD_CYAN}
                      style={StyleSheet.absoluteFill} borderRadius={14} />
                    <Text style={{ fontSize: 20 }}>➤</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

// ─── Section 4: ORGANIZER DASHBOARD ──────────────────────────────────
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
  const [isAttendeesVisible, setIsAttendeesVisible] = useState(false);
  const [selectedEventTitle, setSelectedEventTitle] = useState('');
  const [attendeesList, setAttendeesList] = useState([]);

  const API_URL = 'http://10.191.188.100:3000/api';
  const SOCKET_URL = 'http://10.191.188.100:3000';

  useEffect(() => {
    if (viewMode === 'stats') fetchStats();
    else if (viewMode === 'manage') fetchOrganizerEvents();
  }, [viewMode]);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on('new_event_query', (q) => setOrganizerQueries(prev => [...prev, q]));
    return () => socket.disconnect();
  }, []);

  const fetchStats = () => {
    fetch(`${API_URL}/stats`).then(r => r.json()).then(d => {
      if (d.success) setStats(d.stats);
    }).catch(() => { });
  };

  const fetchOrganizerEvents = async () => {
    try {
      const r = await fetch(`${API_URL}/organizers/${userId}/events`);
      const d = await r.json();
      if (d.success) setManageEvents(d.events);
    } catch (_) { }
  };

  const executeDelete = (eventId) => {
    Alert.alert('Delete Event?', 'Wipes all registrations and chat history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const r = await fetch(`${API_URL}/events/${eventId}`, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) { Alert.alert('Deleted!', d.message); fetchOrganizerEvents(); }
          } catch (_) { Alert.alert('Error', 'Server unreachable.'); }
        },
      },
    ]);
  };

  const handleBroadcast = (eventId, eventTitle) => {
    Alert.prompt(
      '📣 Broadcast Blast',
      `Send an urgent message to all registrants of "${eventTitle}":`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Blast', style: 'default',
          onPress: async (msg) => {
            if (!msg || !msg.trim()) { Alert.alert('Empty', 'Please type a message first.'); return; }
            try {
              const r = await fetch(`${API_URL}/events/${eventId}/broadcast`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg.trim(), eventTitle }),
              });
              const d = await r.json();
              Alert.alert(d.success ? '🚀 Blast Sent!' : '❌ Failed', d.message);
            } catch (_) { Alert.alert('Error', 'Server unreachable.'); }
          },
        },
      ],
      'plain-text'
    );
  };

  const openEditModal = (event) => {
    setCurrentEventObj(event);
    setEditTitle(event.title);
    setEditDesc(event.description);
    setEditVenue(event.venue);
    setEditLimit(event.limit_participants.toString());
    setEditCategory(event.category || 'General');
    setEditImageUri(event.image_url);
    setIsEditModalVisible(true);
  };

  const executeUpdate = async () => {
    try {
      const formData = new FormData();
      formData.append('title', editTitle);
      formData.append('description', editDesc);
      formData.append('venue', editVenue);
      formData.append('limit_participants', editLimit || 0);
      formData.append('category', editCategory);
      if (editImageUri && !editImageUri.startsWith('http')) {
        formData.append('poster', { uri: editImageUri, name: 'poster.jpg', type: 'image/jpeg' });
      } else {
        formData.append('image_url', editImageUri || '');
      }
      const r = await fetch(`${API_URL}/events/${currentEventObj.event_id}`, { method: 'PUT', body: formData });
      const d = await r.json();
      if (d.success) {
        Alert.alert('Updated! ✨', d.message);
        setIsEditModalVisible(false);
        fetchOrganizerEvents();
      } else Alert.alert('Error', d.message);
    } catch (_) { Alert.alert('Error', 'Server unreachable.'); }
  };

  const openOrganizerChat = async (event) => {
    setCurrentEventObj(event);
    setIsChatVisible(true);
    try {
      const r = await fetch(`${API_URL}/queries/${event.event_id}`);
      const d = await r.json();
      if (d.success) setOrganizerQueries(d.queries);
    } catch (_) { }
  };

  const handleOrganizerReply = async () => {
    if (!replyMessage.trim()) return;
    try {
      const r = await fetch(`${API_URL}/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: currentEventObj.event_id,
          user_id: 1,
          user_name: `[Organizer] ${userName}`,
          message: replyMessage,
        }),
      });
      const d = await r.json();
      if (d.success) setReplyMessage('');
    } catch (_) { }
  };

  const viewAttendees = async (eventId, eventTitle) => {
    try {
      const r = await fetch(`${API_URL}/attendees/${eventId}`);
      const d = await r.json();
      if (d.success) {
        setAttendeesList(d.attendees);
        setSelectedEventTitle(eventTitle);
        setIsAttendeesVisible(true);
      }
    } catch (_) { Alert.alert('Error', 'Could not fetch attendees.'); }
  };

  const exportToCSV = async () => {
    try {
      let csv = 'Student Name,Email Address\n';
      attendeesList.forEach(u => { csv += `"${u.name}","${u.email}"\n`; });
      const fileUri = FileSystem.documentDirectory + `${selectedEventTitle.replace(/\s+/g, '_')}_Attendance.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv);
      const ok = await Sharing.isAvailableAsync();
      if (ok) await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share Attendance' });
      else Alert.alert('Unavailable', 'Sharing not available on this device.');
    } catch (_) { Alert.alert('Error', 'Could not export CSV.'); }
  };

  const onChangeDate = (e, d) => {
    setShowDatePicker(false);
    if (d) { setDate(d); setTimeout(() => setShowTimePicker(true), 150); }
  };
  const onChangeTime = (e, t) => {
    setShowTimePicker(false);
    if (t) { const nd = new Date(date); nd.setHours(t.getHours()); nd.setMinutes(t.getMinutes()); setDate(nd); }
  };
  const formatMySQL = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [16, 9], quality: 0.8,
    });
    if (!r.canceled) setImageUri(r.assets[0].uri);
  };

  const handleCreateEvent = async () => {
    if (!title || !venue) { Alert.alert('Hold on', 'Title and Venue required'); return; }
    setIsPosting(true);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('date', formatMySQL(date));
      formData.append('venue', venue);
      formData.append('limit_participants', limitParticipants || 0);
      formData.append('category', category);
      formData.append('organizer_id', userId);
      if (imageUri) formData.append('poster', { uri: imageUri, name: 'poster.jpg', type: 'image/jpeg' });
      const r = await fetch(`${API_URL}/events`, { method: 'POST', body: formData });
      const d = await r.json();
      if (d.success) {
        Alert.alert('Published! 🚀', 'Event is live!');
        setTitle(''); setVenue(''); setDescription(''); setImageUri(null);
      } else Alert.alert('Error', d.message);
    } catch (_) { Alert.alert('Error', 'Server unreachable'); }
    finally { setIsPosting(false); }
  };

  const handleBarCodeScanned = async ({ data }) => {
    setScanned(true);
    try {
      const r = await fetch(`${API_URL}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: data }),
      });
      const d = await r.json();
      Alert.alert(
        d.success ? '✅ Verified!' : '❌ Invalid Ticket',
        d.message,
        [{ text: d.success ? 'Scan Next' : 'Try Again', onPress: () => setScanned(false) }]
      );
    } catch (_) { Alert.alert('Error', 'Server unreachable.'); setScanned(false); }
  };

  const ORGANIZER_CATS = ['General', 'Tech', 'Arts', 'Sports', 'Party', 'Workshop'];

  const ORG_TABS = [
    { key: 'create', icon: '✦', label: 'Create' },
    { key: 'manage', icon: '🎛', label: 'Manage' },
    { key: 'scan', icon: '📷', label: 'Scan' },
    { key: 'stats', icon: '📊', label: 'Stats' },
  ];

  const handleOrgLogout = () => {
    Alert.alert('Log out?', 'See you next time 👋', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => navigation.replace('Login') },
    ]);
  };

  // ── Stats view ──
  const renderStats = () => (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Live Analytics 📊</Text>
      {stats.length === 0
        ? <ActivityIndicator size="large" color={COLORS.accent1} style={{ marginTop: 40 }} />
        : stats.map(item => {
          const reg = item.total_registered || 0;
          const att = item.total_attended || 0;
          const pct = reg > 0 ? (att / reg) * 100 : 0;
          return (
            <GlassCard key={item.event_id} style={{ marginBottom: 16 }}>
              <Text style={styles.statCardTitle}>{item.title}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 12 }}>
                {[
                  { colors: GRAD_PURPLE, num: reg, label: 'Registered' },
                  { colors: GRAD_GREEN, num: att, label: 'Attended' },
                  { colors: GRAD_WARM, num: pct.toFixed(0) + '%', label: 'Show-up' },
                ].map((chip, i) => (
                  <View key={i} style={styles.statChip}>
                    <LinearGradient colors={chip.colors} style={StyleSheet.absoluteFill} borderRadius={10} />
                    <Text style={styles.statChipLabel}>{chip.num}</Text>
                    <Text style={styles.statChipSub}>{chip.label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.progressBg}>
                <LinearGradient colors={GRAD_GREEN} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              {att > 0 && (
                <TouchableOpacity style={styles.viewAttendeesBtn}
                  onPress={() => viewAttendees(item.event_id, item.title)}>
                  <LinearGradient colors={GRAD_CYAN} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill} borderRadius={10} />
                  <Text style={styles.viewAttendeesText}>View Attendees ➔</Text>
                </TouchableOpacity>
              )}
            </GlassCard>
          );
        })
      }

      {/* Attendees Modal */}
      <Modal visible={isAttendeesVisible} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setIsAttendeesVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <GlowDot color={COLORS.accent3} size={200} style={{ top: -40, right: -40 }} />
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={() => setIsAttendeesVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalNavTitle} numberOfLines={1}>{selectedEventTitle}</Text>
            <TouchableOpacity onPress={exportToCSV} style={styles.csvBtn}>
              <LinearGradient colors={GRAD_GREEN} style={StyleSheet.absoluteFill} borderRadius={10} />
              <Text style={styles.csvBtnText}>CSV ⬇</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.attendeesSubHeader}>
            <Text style={styles.attendeesCount}>{attendeesList.length} checked-in students</Text>
          </View>
          <FlatList
            data={attendeesList}
            keyExtractor={(_, i) => i.toString()}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <GlassCard style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', padding: 14 }}>
                <View style={styles.avatarCircle}>
                  <LinearGradient colors={GRAD_PURPLE} style={StyleSheet.absoluteFill} borderRadius={22} />
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.attendeeName}>{item.name}</Text>
                  <Text style={styles.attendeeEmail}>{item.email}</Text>
                </View>
              </GlassCard>
            )}
          />
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );

  // ── Scanner view ──
  const renderScanner = () => {
    if (!permission) return <ActivityIndicator size="large" color={COLORS.accent1} style={{ marginTop: 40 }} />;
    if (!permission.granted) {
      return (
        <View style={styles.permissionCard}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
          <Text style={styles.permissionText}>Camera access needed to scan tickets</Text>
          <GradientButton onPress={requestPermission} label="Grant Access" colors={GRAD_PURPLE} style={{ marginTop: 16 }} />
        </View>
      );
    }
    return (
      <View style={{ flex: 1, alignItems: 'center', padding: 20 }}>
        <Text style={styles.sectionTitle}>Scan Student Tickets</Text>
        <Text style={styles.sectionSubtitle}>Point at any QR code ticket</Text>
        <View style={styles.cameraOuter}>
          <LinearGradient colors={GRAD_PURPLE} style={StyleSheet.absoluteFill} borderRadius={24} />
          <View style={styles.cameraInner}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            />
          </View>
        </View>
        {scanned && (
          <GradientButton onPress={() => setScanned(false)} label="Scan Next Ticket"
            colors={GRAD_CYAN} style={{ marginTop: 24, width: '100%' }} />
        )}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <GlowDot color={COLORS.accent3} size={300} style={{ top: -60, left: -60 }} />
      <GlowDot color={COLORS.accent1} size={200} style={{ bottom: 200, right: -60 }} />

      <View style={styles.screenHeader}>
        <View>
          <Text style={styles.screenHeaderSub}>Welcome, {userName.split(' ')[0]} 🎛️</Text>
          <Text style={styles.screenHeaderTitle}>Organizer Hub</Text>
        </View>
        {/* Logout lives in this icon for organizer */}
        <TouchableOpacity onPress={handleOrgLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutBtnText}>🚪 Exit</Text>
        </TouchableOpacity>
      </View>

      {/* ── CREATE ── */}
      {viewMode === 'create' && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>New Event</Text>
          <GlassCard>
            <GlassInput placeholder="Event Title ✦" value={title} onChangeText={setTitle} />
            <GlassInput placeholder="Description" value={description} onChangeText={setDescription}
              multiline style={{ minHeight: 80 }} />
            <GlassInput placeholder="Venue / Location" value={venue} onChangeText={setVenue} />
            <GlassInput placeholder="Capacity limit (e.g. 50)" keyboardType="numeric"
              value={limitParticipants} onChangeText={setLimitParticipants} />

            <Text style={styles.labelText}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {ORGANIZER_CATS.map(cat => {
                const catObj = CATEGORIES.find(c => c.label === cat);
                return (
                  <CategoryPill key={cat}
                    label={(catObj?.icon || '') + ' ' + cat}
                    active={category === cat}
                    color={catObj?.color}
                    onPress={() => setCategory(cat)}
                  />
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
              {imageUri
                ? <Image source={{ uri: imageUri }} style={styles.uploadPreview} resizeMode="cover" />
                : (
                  <>
                    <LinearGradient colors={GRAD_PURPLE} style={styles.uploadIconCircle}>
                      <Text style={{ fontSize: 28 }}>📸</Text>
                    </LinearGradient>
                    <Text style={styles.uploadBtnText}>Upload Cover Image</Text>
                  </>
                )
              }
            </TouchableOpacity>

            <Text style={styles.labelText}>Date & Time</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <LinearGradient colors={['rgba(124,58,237,0.15)', 'rgba(236,72,153,0.15)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill} borderRadius={14} />
              <Text style={styles.dateBtnText}>
                📅 {date.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}
              </Text>
            </TouchableOpacity>
            {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />}
            {showTimePicker && <DateTimePicker value={date} mode="time" display="default" onChange={onChangeTime} />}

            <GradientButton
              onPress={handleCreateEvent}
              disabled={isPosting}
              label="Publish Event 🚀"
              colors={GRAD_PURPLE}
              style={{ marginTop: 8 }}
            />
          </GlassCard>
        </ScrollView>
      )}

      {/* ── MANAGE ── */}
      {viewMode === 'manage' && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Command Center 🎛️</Text>
          {manageEvents.length === 0
            ? <ActivityIndicator size="large" color={COLORS.accent1} style={{ marginTop: 40 }} />
            : manageEvents.map(item => (
              <GlassCard key={item.event_id} style={{ marginBottom: 16 }}>
                <Text style={styles.statCardTitle}>{item.title}</Text>
                <Text style={styles.manageMetaText}>
                  📅 {new Date(item.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} · 📍 {item.venue}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity onPress={() => openEditModal(item)}
                    style={[styles.actionBtn, { flex: 1 }]}>
                    <LinearGradient colors={GRAD_CYAN} style={StyleSheet.absoluteFill} borderRadius={12} />
                    <Text style={styles.actionBtnText}>🖍️ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => executeDelete(item.event_id)}
                    style={[styles.actionBtn, { flex: 1 }]}>
                    <LinearGradient colors={[COLORS.danger, '#DC2626']}
                      style={StyleSheet.absoluteFill} borderRadius={12} />
                    <Text style={styles.actionBtnText}>❌ Delete</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => openOrganizerChat(item)}
                  style={[styles.actionBtn, { marginTop: 10 }]}>
                  <LinearGradient colors={GRAD_PURPLE} style={StyleSheet.absoluteFill} borderRadius={12} />
                  <Text style={styles.actionBtnText}>💬 Enter Q&A Hub</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleBroadcast(item.event_id, item.title)}
                  style={[styles.actionBtn, { marginTop: 10, backgroundColor: 'transparent' }]}>
                  <LinearGradient colors={['#F59E0B', '#EF4444']} style={StyleSheet.absoluteFill} borderRadius={12} />
                  <Text style={styles.actionBtnText}>📣 Broadcast Blast</Text>
                </TouchableOpacity>
              </GlassCard>
            ))
          }
        </ScrollView>
      )}

      {viewMode === 'scan' && renderScanner()}
      {viewMode === 'stats' && renderStats()}

      <TabBar tabs={ORG_TABS} active={viewMode} onChange={setViewMode} />

      {/* ── Edit Modal ── */}
      <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={() => setIsEditModalVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalNavTitle}>Edit Event</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <GlassInput placeholder="Title" value={editTitle} onChangeText={setEditTitle} />
            <GlassInput placeholder="Description" value={editDesc} onChangeText={setEditDesc} multiline style={{ minHeight: 80 }} />
            <GlassInput placeholder="Venue" value={editVenue} onChangeText={setEditVenue} />
            <GlassInput placeholder="Capacity" value={editLimit} onChangeText={setEditLimit} keyboardType="numeric" />

            <Text style={styles.labelText}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {ORGANIZER_CATS.map(cat => {
                const catObj = CATEGORIES.find(c => c.label === cat);
                return (
                  <CategoryPill key={cat}
                    label={(catObj?.icon || '') + ' ' + cat}
                    active={editCategory === cat}
                    color={catObj?.color}
                    onPress={() => setEditCategory(cat)}
                  />
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.uploadBtn} onPress={async () => {
              const r = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true, aspect: [16, 9], quality: 0.8,
              });
              if (!r.canceled) setEditImageUri(r.assets[0].uri);
            }}>
              {editImageUri
                ? <Image source={{ uri: editImageUri }} style={styles.uploadPreview} resizeMode="cover" />
                : (
                  <>
                    <LinearGradient colors={GRAD_PURPLE} style={styles.uploadIconCircle}>
                      <Text style={{ fontSize: 28 }}>📸</Text>
                    </LinearGradient>
                    <Text style={styles.uploadBtnText}>Change Cover Image</Text>
                  </>
                )
              }
            </TouchableOpacity>

            <GradientButton onPress={executeUpdate} label="Save Changes ✓"
              colors={GRAD_GREEN} style={{ marginTop: 20 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Organizer Chat Modal ── */}
      <Modal visible={isChatVisible} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <GlowDot color={COLORS.accent3} size={200} style={{ top: -40, right: -40 }} />
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={() => setIsChatVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalNavTitle} numberOfLines={1}>💬 {currentEventObj?.title}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={{ flex: 1, padding: 20 }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              {organizerQueries.map((q, i) => {
                const isOrg = q.user_name.includes('[Organizer]');
                return (
                  <View key={i} style={[styles.qaBubble, isOrg && styles.qaBubbleOrg]}>
                    <Text style={[styles.qaBubbleName, isOrg && { color: COLORS.accent3 }]}>
                      {q.user_name}
                    </Text>
                    <Text style={styles.qaBubbleMsg}>{q.message}</Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.qaInputRow}>
              <TextInput
                style={styles.qaInput}
                placeholder="Reply to students..."
                placeholderTextColor={COLORS.textMuted}
                value={replyMessage}
                onChangeText={setReplyMessage}
              />
              <TouchableOpacity onPress={handleOrganizerReply} style={styles.qaSendBtn}>
                <LinearGradient colors={GRAD_CYAN} style={StyleSheet.absoluteFill} borderRadius={14} />
                <Text style={{ fontSize: 20 }}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ─── Section 5: ADMIN DASHBOARD ──────────────────────────────────────
function AdminDashboard({ route, navigation }) {
  const { userName } = route.params;
  const [viewMode, setViewMode] = useState('stats');
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const API_URL = 'http://10.191.188.100:3000/api';

  const ADMIN_TABS = [
    { key: 'stats', icon: '📊', label: 'Analytics' },
    { key: 'users', icon: '👥', label: 'Users' },
    { key: 'events', icon: '🎪', label: 'Events' }
  ];

  useEffect(() => {
    if (viewMode === 'stats') fetchStats();
    else if (viewMode === 'users') fetchUsers();
    else fetchEvents();
  }, [viewMode]);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}/admin/stats`);
      const d = await r.json();
      if (d.success) setStats(d.stats);
    } catch (_) { } finally { setIsLoading(false); }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}/admin/users`);
      const d = await r.json();
      if (d.success) setUsers(d.users);
    } catch (_) { } finally { setIsLoading(false); }
  };

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_URL}/events`); // we reuse public events endpoint for listing
      const d = await r.json();
      if (d.success) setEvents(d.events);
    } catch (_) { } finally { setIsLoading(false); }
  };

  const handlePromoteUser = (userId, name) => {
    Alert.alert('Promote User', `Upgrade ${name} to an Organizer?`, [
       { text: 'Cancel', style: 'cancel' },
       { text: 'Promote', style: 'default', onPress: async () => {
          try {
             await fetch(`${API_URL}/admin/users/${userId}/role`, { method: 'PUT' });
             fetchUsers();
          } catch (_) {}
       }}
    ]);
  };
  
  const handleApproveUser = (userId, name) => {
    Alert.alert('Approve Organizer', `Allow ${name} to access the Organizer Hub?`, [
       { text: 'Cancel', style: 'cancel' },
       { text: 'Approve', style: 'default', onPress: async () => {
          try {
             await fetch(`${API_URL}/admin/users/${userId}/approve`, { method: 'PUT' });
             fetchUsers();
          } catch (_) {}
       }}
    ]);
  };
  
  const handleApproveEvent = (eventId) => {
     Alert.alert('Approve Event', 'Make this event visible to all students?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish Live', onPress: async () => {
           try {
              await fetch(`${API_URL}/admin/events/${eventId}/approve`, { method: 'PUT' });
              fetchEvents();
           } catch (_) {}
        }}
     ]);
  };

  const handleDeleteUser = (userId, name) => {
    Alert.alert('BAN USER', `Are you sure you want to permanently delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Eradicate', style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/admin/users/${userId}`, { method: 'DELETE' });
            fetchUsers();
          } catch (_) { }
        }
      }
    ]);
  };

  const handleDeleteEvent = (eventId, title) => {
    Alert.alert('DELETE EVENT', `Destroy event "${title}" globally?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Destroy', style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/admin/events/${eventId}`, { method: 'DELETE' });
            fetchEvents();
          } catch (_) { }
        }
      }
    ]);
  };

  const handleAdminLogout = () => {
    Alert.alert('Log out?', 'Leaving God-Mode.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => navigation.replace('Login') },
    ]);
  };

  const renderAnalyticCard = (title, value, icon, color) => (
    <GlassCard style={{ flex: 1, padding: 20, alignItems: 'center', marginBottom: 12 }}>
      <Text style={{ fontSize: 32 }}>{icon}</Text>
      <Text style={{ fontSize: 28, fontWeight: '900', color: color, marginVertical: 8 }}>{value || 0}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
    </GlassCard>
  );

  const renderUser = ({ item }) => (
    <GlassCard style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <InitialsAvatar name={item.name} size={48} fontSize={18} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 18, color: COLORS.text, fontWeight: '800' }}>{item.name}</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{item.email}</Text>
          <Text style={{ color: item.role === 'admin' ? COLORS.danger : COLORS.accent3, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
            ROLE: {item.role.toUpperCase()}
            {item.account_status === 'pending' && <Text style={{ color: '#FFA500' }}> (PENDING)</Text>}
          </Text>
        </View>
        {item.account_status === 'pending' && item.role === 'organizer' && (
          <TouchableOpacity onPress={() => handleApproveUser(item.user_id, item.name)}
             style={{ padding: 12, marginRight: 8, backgroundColor: '#00FF0030', borderRadius: 12, borderWidth: 1, borderColor: '#00FF00' }}>
             <Text style={{ fontSize: 16 }}>✅</Text>
          </TouchableOpacity>
        )}
        {item.role === 'student' && (
          <TouchableOpacity onPress={() => handlePromoteUser(item.user_id, item.name)}
             style={{ padding: 12, marginRight: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 }}>
             <Text style={{ fontSize: 16 }}>⭐</Text>
          </TouchableOpacity>
        )}
        {item.role !== 'admin' && (
          <TouchableOpacity onPress={() => handleDeleteUser(item.user_id, item.name)}
            style={{ backgroundColor: COLORS.danger + '30', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.danger + '60' }}>
            <Text style={{ fontSize: 16 }}>💀</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {item.role === 'organizer' && item.club_name && (
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
          <Text style={{ color: COLORS.accent1, fontSize: 12, fontWeight: '800', marginBottom: 4 }}>VERIFICATION DATA</Text>
          <Text style={{ color: COLORS.text, fontSize: 13 }}>Club: <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{item.club_name} ({item.club_role})</Text></Text>
          <Text style={{ color: COLORS.text, fontSize: 13 }}>Dept: <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{item.department} • {item.study_year}</Text></Text>
          <Text style={{ color: COLORS.text, fontSize: 13 }}>Student ID: <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{item.student_id}</Text></Text>
          <Text style={{ color: COLORS.text, fontSize: 13 }}>Phone: <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{item.phone}</Text></Text>
        </View>
      )}
    </GlassCard>
  );

  const renderGlobalEvent = ({ item }) => (
    <GlassCard style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
         <View style={{ flex: 1 }}>
           <Text style={{ fontSize: 18, color: COLORS.text, fontWeight: '800' }}>{item.title}</Text>
           <Text style={{ color: COLORS.textSub, fontSize: 13, marginBottom: 8 }}>{item.venue} • {new Date(item.date).toLocaleDateString()}</Text>
           <Text style={{ color: item.status === 'pending' ? '#FFA500' : '#00FF00', fontWeight: '800', fontSize: 12 }}>
              STATUS: {item.status?.toUpperCase() || 'APPROVED'}
           </Text>
         </View>
         
         <View style={{ flexDirection: 'row', height: 48 }}>
           {item.status === 'pending' && (
             <TouchableOpacity onPress={() => handleApproveEvent(item.event_id)}
                style={{ backgroundColor: '#00FF0030', padding: 12, borderRadius: 12, marginRight: 8, borderWidth: 1, borderColor: '#00FF00' }}>
                <Text style={{ fontSize: 18 }}>✅</Text>
             </TouchableOpacity>
           )}
           <TouchableOpacity onPress={() => handleDeleteEvent(item.event_id, item.title)}
             style={{ backgroundColor: COLORS.danger + '30', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.danger + '60' }}>
             <Text style={{ fontSize: 18 }}>💣</Text>
           </TouchableOpacity>
         </View>
      </View>
    </GlassCard>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <GlowDot color={COLORS.danger} size={300} style={{ top: -60, right: -60 }} />
      <GlowDot color={COLORS.accent1} size={200} style={{ bottom: 200, left: -60 }} />

      <View style={styles.screenHeader}>
        <View>
          <Text style={[styles.screenHeaderSub, { color: COLORS.danger }]}>SYSTEM OVERRIDE</Text>
          <Text style={styles.screenHeaderTitle}>God-Mode</Text>
        </View>
        <TouchableOpacity onPress={handleAdminLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutBtnText}>🚪 Exit</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.danger} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
           {viewMode === 'stats' && stats && (
              <>
                <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 16 }}>Platform Overview</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                   {renderAnalyticCard('Total Events', stats.totalEvents, '🎪', COLORS.accent1)}
                   {renderAnalyticCard('Global Registrations', stats.totalRegistrations, '🎟️', COLORS.accent2)}
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                   {renderAnalyticCard('Attendance Rate', `${stats.attendanceRate}%`, '✅', '#00FF00')}
                   {renderAnalyticCard('Q&A Engagements', stats.totalEngagement, '💬', COLORS.accent3)}
                </View>
              </>
           )}
           {viewMode === 'users' && users.map((u, i) => <View key={i}>{renderUser({item: u})}</View>)}
           {viewMode === 'events' && events.map((e, i) => <View key={i}>{renderGlobalEvent({item: e})}</View>)}
        </ScrollView>
      )}

      {/* Admin Tab Bar uses Bottom Nav too */}
      <TabBar tabs={ADMIN_TABS} active={viewMode} onChange={setViewMode} />
    </SafeAreaView>
  );
}

// ─── Section 6: Router ────────────────────────────────────────────────
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Student" component={StudentDashboard} />
        <Stack.Screen name="Organizer" component={OrganizerDashboard} />
        <Stack.Screen name="Admin" component={AdminDashboard} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ─── Section 6: StyleSheet ────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Screens ──
  screen: {
    flex: 1, backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : (Platform.OS === 'ios' ? 44 : 0),
  },
  screenHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  screenHeaderSub: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  screenHeaderTitle: { fontSize: 28, color: COLORS.text, fontWeight: '800', letterSpacing: -0.5 },
  logoutBtn: {
    backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.bgGlassBorder,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  logoutBtnText: { color: COLORS.danger, fontWeight: '700', fontSize: 13 },

  // ── Login ──
  loginScroll: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: 24, paddingTop: Platform.OS === 'ios' ? 80 : 60,
  },
  logoMark: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.accent1, shadowRadius: 20, shadowOpacity: 0.6, elevation: 8,
    overflow: 'hidden',
  },
  appName: { fontSize: 38, fontWeight: '900', color: COLORS.text, letterSpacing: -1, marginTop: 16 },
  appTagline: { fontSize: 16, color: COLORS.textMuted, marginTop: 6, letterSpacing: 0.3 },
  formHeading: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 20, letterSpacing: -0.3 },
  roleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  roleBtnActive: { borderColor: 'transparent' },
  roleBtnText: { color: COLORS.textSub, fontWeight: '700', fontSize: 15 },
  switchText: { color: COLORS.textMuted, fontSize: 14 },

  // ── Glass Card ──
  glassCard: {
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1, borderColor: COLORS.bgGlassBorder,
    borderRadius: 20, padding: 20,
  },

  // ── Glass Input ──
  glassInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.text, fontSize: 15, marginBottom: 14,
  },

  // ── Gradient Button ──
  gradBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16,
    shadowColor: COLORS.accent1, shadowRadius: 12, shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
  },
  gradBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // ── Bottom Tab Bar (Instagram-style) ──
  tabBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(8,11,20,0.92)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  tabIconWrap: {
    width: 48, height: 32,
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  tabIcon: { fontSize: 20 },
  tabIconActive: {},
  tabBadge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: COLORS.accent2,
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: COLORS.bg,
  },
  tabBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  tabLabel: { color: COLORS.textMuted, fontWeight: '600', fontSize: 10 },
  tabLabelActive: { color: COLORS.accent1 },

  // ── Category Pill ──
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginRight: 0,
  },
  pillText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },

  // ── Search Bar ──
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15 },

  // ── Event Card ──
  eventCard: {
    backgroundColor: COLORS.bgCard, borderRadius: 20,
    marginBottom: 16, borderWidth: 1, overflow: 'hidden',
  },
  eventCardAccent: { height: 3, width: '100%' },
  eventCardImg: { width: '100%', height: 180 },
  eventCardImgPlaceholder: { width: '100%', height: 140, alignItems: 'center', justifyContent: 'center' },
  eventCardBody: { padding: 16 },
  catBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, marginBottom: 10,
  },
  catBadgeText: { fontSize: 12, fontWeight: '700' },
  eventCardTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 8, letterSpacing: -0.3 },
  eventCardMeta: { gap: 4, marginBottom: 8 },
  eventCardMetaText: { color: COLORS.textSub, fontSize: 13, fontWeight: '500' },
  eventCardDesc: { color: COLORS.textMuted, fontSize: 14, lineHeight: 20 },

  // ── Ticket Card ──
  ticketImg: { width: '100%', height: 160 },
  ticketRibbon: { paddingHorizontal: 16, paddingVertical: 8 },
  ticketRibbonText: { color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },
  ticketTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  ticketMeta: { color: COLORS.textSub, fontSize: 13, marginBottom: 4, fontWeight: '500' },
  qrSection: {
    alignItems: 'center', marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
  },
  qrLabel: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 16 },
  qrFrame: {
    padding: 16, backgroundColor: COLORS.bg,
    borderRadius: 16, shadowColor: COLORS.accent1,
    shadowRadius: 20, shadowOpacity: 0.3, elevation: 5,
  },
  ticketIdBadge: {
    marginTop: 14, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, overflow: 'hidden',
  },
  ticketIdText: { color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: 1 },

  // ── Alert Card ──
  alertCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.bgCard,
    borderRadius: 16, marginBottom: 12, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  alertCardUnread: {
    borderColor: COLORS.accent2 + '40',
    backgroundColor: 'rgba(236,72,153,0.08)',
  },
  alertUnreadBar: { width: 3, borderRadius: 2, alignSelf: 'stretch' },
  alertText: { color: COLORS.text, fontWeight: '600', fontSize: 14, marginBottom: 6 },
  alertDate: { color: COLORS.textMuted, fontSize: 12 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent2, marginLeft: 8, marginTop: 2 },

  // ── Empty State ──
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: COLORS.textMuted, fontSize: 18, fontWeight: '600' },

  // ── Modal ──
  modalNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.bgGlass,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalCloseBtnText: { color: COLORS.textSub, fontWeight: '800', fontSize: 14 },
  modalNavTitle: {
    flex: 1, textAlign: 'center', fontSize: 15,
    fontWeight: '800', color: COLORS.text, marginHorizontal: 8,
  },
  csvBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  csvBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  modalHeroImg: { width: '100%', height: 200, borderRadius: 16, marginBottom: 16 },
  modalHeroPlaceholder: { width: '100%', height: 160, borderRadius: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  modalEventTitle: { fontSize: 26, fontWeight: '900', color: COLORS.text, marginBottom: 12, letterSpacing: -0.5 },
  modalMetaPill: {
    backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  modalMetaText: { color: COLORS.textSub, fontSize: 13, fontWeight: '600' },
  modalDesc: { color: COLORS.textMuted, fontSize: 15, lineHeight: 24 },

  // ── Q&A Board ──
  qaSection: { marginTop: 8 },
  qaSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  qaSectionDot: { width: 12, height: 12, borderRadius: 6 },
  qaSectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  qaBubble: {
    backgroundColor: COLORS.bgCard, padding: 14, borderRadius: 14,
    marginBottom: 10, borderWidth: 1, borderColor: COLORS.border,
    borderTopLeftRadius: 4,
  },
  qaBubbleSelf: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderColor: COLORS.accent1 + '40', borderTopLeftRadius: 14, borderTopRightRadius: 4,
  },
  qaBubbleOrg: {
    backgroundColor: 'rgba(6,182,212,0.10)', borderColor: COLORS.accent3 + '40',
  },
  qaBubbleName: { fontWeight: '800', color: COLORS.accent1, marginBottom: 4, fontSize: 13 },
  qaBubbleMsg: { color: COLORS.textSub, fontSize: 14, lineHeight: 20 },
  qaInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  qaInput: {
    flex: 1, backgroundColor: COLORS.bgGlass,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.text, fontSize: 15,
  },
  qaSendBtn: {
    width: 50, height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },

  // ── Profile Screen ──
  profileHero: {
    alignItems: 'center', paddingTop: 16,
    paddingHorizontal: 20, paddingBottom: 24,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  profileName: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 12, marginBottom: 8 },
  tierBadge: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, marginBottom: 14,
  },
  tierBadgeText: { fontSize: 13, fontWeight: '700' },
  interestRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  interestPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  interestPillText: { color: COLORS.textSub, fontSize: 12, fontWeight: '600' },

  // ── Stats Row ──
  statsRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statNum: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' },

  // ── Streak Banner ──
  streakBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: 16,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 0.5, borderColor: 'rgba(245,158,11,0.30)',
    borderRadius: 14, padding: 14,
  },
  streakBannerTitle: { fontSize: 13, color: '#EF9F27', fontWeight: '700', marginBottom: 6 },
  progressBg: {
    width: '100%', height: 6, backgroundColor: COLORS.border,
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },

  // ── Badges ──
  profileSection: { paddingHorizontal: 20, marginTop: 24 },
  profileSectionTitle: {
    fontSize: 11, color: COLORS.textMuted, fontWeight: '700',
    letterSpacing: 0.1, marginBottom: 14,
  },
  badgesGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  badgeItem: {
    width: (SCREEN_W - 40 - 36) / 4,
    alignItems: 'center', gap: 6, position: 'relative',
  },
  badgeIcon: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeIconEarned: { borderWidth: 1, borderColor: COLORS.accent1 + '50' },
  badgeIconLocked: {
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  badgeName: { fontSize: 10, color: COLORS.textSub, textAlign: 'center', fontWeight: '600' },
  badgeEarnedDot: {
    position: 'absolute', top: 0, right: 4,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.success,
    borderWidth: 1.5, borderColor: COLORS.bg,
  },

  // ── Settings Menu ──
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  menuIconBox: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  menuLabel: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  menuArrow: { fontSize: 18, color: COLORS.textMuted },
  logoutRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.20)',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
  },
  versionText: {
    textAlign: 'center', color: COLORS.textMuted,
    fontSize: 12, marginTop: 24, marginBottom: 8,
  },

  // ── Stats ──
  sectionTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginBottom: 4, letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 14, color: COLORS.textMuted, marginBottom: 20, fontWeight: '500' },
  statCardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  statChip: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: 10, overflow: 'hidden', marginHorizontal: 4,
  },
  statChipLabel: { color: '#FFF', fontWeight: '900', fontSize: 18 },
  statChipSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginTop: 2 },

  viewAttendeesBtn: {
    marginTop: 14, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  viewAttendeesText: { color: '#FFF', fontWeight: '800', fontSize: 14 },

  // ── Manage Hub ──
  manageMetaText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500', marginTop: 4 },
  actionBtn: {
    paddingVertical: 12, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },

  // ── Create Form ──
  labelText: {
    color: COLORS.textSub, fontWeight: '700', fontSize: 13,
    marginBottom: 8, letterSpacing: 0.3,
  },
  uploadBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    borderRadius: 16, padding: 20, alignItems: 'center',
    justifyContent: 'center', marginBottom: 16, minHeight: 100, overflow: 'hidden',
  },
  uploadIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  uploadBtnText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 14 },
  uploadPreview: { width: '100%', height: 140, borderRadius: 12 },
  dateBtn: {
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  dateBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 15 },

  // ── Scanner ──
  cameraOuter: {
    width: 280, height: 280, borderRadius: 24,
    marginTop: 24, overflow: 'hidden', padding: 4,
    shadowColor: COLORS.accent1, shadowRadius: 24, shadowOpacity: 0.5, elevation: 10,
  },
  cameraInner: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  permissionCard: {
    margin: 20, padding: 30, alignItems: 'center',
    backgroundColor: COLORS.bgCard, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
  },
  permissionText: { color: COLORS.textSub, fontSize: 16, fontWeight: '600', textAlign: 'center' },

  // ── Attendees ──
  attendeesSubHeader: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  attendeesCount: { color: COLORS.textMuted, fontWeight: '700', fontSize: 14 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  attendeeName: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  attendeeEmail: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
});