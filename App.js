import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Image, FlatList, Modal, SafeAreaView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const Stack = createNativeStackNavigator();

// 1. The Student Dashboard (Now featuring My QR Tickets!)
function StudentDashboard({ route, navigation }) {
  const { userName, userId } = route.params;
  const [events, setEvents] = useState([]);
  const [myTickets, setMyTickets] = useState([]); // Holds the registered tickets!
  const [isLoading, setIsLoading] = useState(true);

  // NEW: Determines if they are looking at "Discover" or "My Tickets"
  const [viewMode, setViewMode] = useState('events');

  const API_URL = 'http://10.118.76.100:3000/api';

  // Automatically fetch data depending on which tab they clicked
  useEffect(() => {
    if (viewMode === 'events') fetchEvents();
    else fetchMyTickets();
  }, [viewMode]);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/events`);
      const data = await response.json();
      if (data.success) setEvents(data.events);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not load upcoming events.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMyTickets = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/tickets/${userId}`);
      const data = await response.json();
      if (data.success) setMyTickets(data.tickets);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not load your tickets.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (eventId) => {
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, event_id: eventId })
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('Registered! 🎉', data.message);
      } else {
        Alert.alert('Heads up', data.message);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Network Error', 'Could not register for the event.');
    }
  };

  // UI for Discovering Events
  const renderEvent = ({ item }) => (
    <View style={styles.eventCard}>
      {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.eventImage} resizeMode="cover" /> : null}
      <Text style={styles.eventTitle}>{item.title}</Text>
      <Text style={styles.eventDate}>📅 {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      <Text style={styles.eventVenue}>📍 {item.venue}</Text>
      {item.description ? <Text style={styles.eventDesc}>{item.description}</Text> : null}

      <TouchableOpacity style={styles.registerButton} onPress={() => handleRegister(item.event_id)}>
        <Text style={styles.buttonText}>Register for Event</Text>
      </TouchableOpacity>
    </View>
  );

  // UI for Showing their QR Code Ticket!
  const renderTicket = ({ item }) => (
    <View style={styles.eventCard}>
      {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.eventImage} resizeMode="cover" /> : null}
      <Text style={styles.eventTitle}>{item.title}</Text>
      <Text style={styles.eventDate}>📅 {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      <Text style={styles.eventVenue}>📍 {item.venue}</Text>

      <View style={styles.qrContainer}>
        <Text style={styles.qrText}>Show this QR code at the door:</Text>
        <View style={styles.qrWrapper}>
          {/* Automatically generates a QR code from the Registration ID! */}
          <QRCode
            value={item.registration_id.toString()}
            size={180}
            color="#2A4365"
            backgroundColor="#F7FAFC"
          />
        </View>
        <Text style={styles.ticketIdText}>Ticket #{item.registration_id}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.dashboardContainer}>
      <Text style={styles.dashboardTitle}>Student Dashboard</Text>
      <Text style={styles.dashboardSubtitle}>Hello {userName}!</Text>

      {/* NEW: Top Menu Tab Toggle */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, viewMode === 'events' && styles.tabActive]}
          onPress={() => setViewMode('events')}
        >
          <Text style={viewMode === 'events' ? styles.tabActiveText : styles.tabInactiveText}>Discover</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, viewMode === 'tickets' && styles.tabActive]}
          onPress={() => setViewMode('tickets')}
        >
          <Text style={viewMode === 'tickets' ? styles.tabActiveText : styles.tabInactiveText}>My Tickets</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#3182CE" style={{ marginTop: 50 }} />
      ) : viewMode === 'events' && events.length === 0 ? (
        <Text style={styles.noEventsText}>No upcoming events found.</Text>
      ) : viewMode === 'tickets' && myTickets.length === 0 ? (
        <Text style={styles.noEventsText}>You haven't registered for any events yet!</Text>
      ) : (
        <FlatList
          data={viewMode === 'events' ? events : myTickets}
          keyExtractor={(item) => (viewMode === 'events' ? item.event_id.toString() : item.registration_id.toString())}
          renderItem={viewMode === 'events' ? renderEvent : renderTicket}
          style={{ width: '100%' }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={() => navigation.replace('Login')}>
        <Text style={styles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

// 2. Organizer Dashboard 
function OrganizerDashboard({ route, navigation }) {
  const { userName } = route.params;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [limit, setLimit] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [viewMode, setViewMode] = useState('create');
  const [stats, setStats] = useState([]);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // NEW: State to track which event's Attendee List is currently expanded!
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [attendeesList, setAttendeesList] = useState([]); // Holds the specific names/emails

  // NEW: State for the buttery-smooth Modal!
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedEventTitle, setSelectedEventTitle] = useState('');

  const API_URL = 'http://10.118.76.100:3000/api';

  useEffect(() => {
    if (viewMode === 'stats') {
      fetch(`${API_URL}/stats`).then(r => r.json()).then(data => {
        if (data.success) setStats(data.stats);
      }).catch(err => console.error(err));
    }
  }, [viewMode]);

  // NEW: The magic function to fetch names, and open the high-performance Modal!
  const viewAttendees = async (eventId, eventTitle) => {
    try {
      const response = await fetch(`${API_URL}/attendees/${eventId}`);
      const data = await response.json();
      if (data.success) {
        setAttendeesList(data.attendees);
        setSelectedEventTitle(eventTitle);
        setIsModalVisible(true); // Pops open the beautiful full-screen Modal!
      }
    } catch (err) { Alert.alert("Error", "Could not fetch attendees list."); }
  };

  // NEW: Generates a physical CSV file in milliseconds!
  const exportToCSV = async () => {
    try {
      // 1. Construct the Raw CSV Text
      let csvString = "Student Name,Email Address\n"; 
      attendeesList.forEach(user => {
        csvString += `"${user.name}","${user.email}"\n`; // Creates the actual rows
      });

      // 2. Write it to the phone's physical Document directory
      const fileUri = FileSystem.documentDirectory + `${selectedEventTitle.replace(/\s+/g, '_')}_Attendance.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvString);

      // 3. Open the Native Share Sheet! (WhatsApp, AirDrop, Email)
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share Attendance File' });
      } else {
        Alert.alert("Uh Oh", "Sharing is not available on this specific device/emulator.");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not export the CSV file.");
    }
  };

  const onChangeDate = (e, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) { setDate(selectedDate); setTimeout(() => setShowTimePicker(true), 150); }
  };
  const onChangeTime = (e, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) { const d = new Date(date); d.setHours(selectedTime.getHours()); d.setMinutes(selectedTime.getMinutes()); setDate(d); }
  };
  const formatDateTimeForMySQL = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const handleCreateEvent = async () => {
    if (!title || !venue) { Alert.alert('Hold on', 'Title and Venue required'); return; }
    setIsPosting(true);
    try {
      const formData = new FormData();
      formData.append('title', title); formData.append('description', description);
      formData.append('date', formatDateTimeForMySQL(date)); formData.append('venue', venue); formData.append('limit_participants', limit || 0);
      if (imageUri) formData.append('poster', { uri: imageUri, name: 'poster.jpg', type: 'image/jpeg' });

      const response = await fetch(`${API_URL}/events`, { method: 'POST', body: formData });
      const data = await response.json();
      if (data.success) { Alert.alert('Success!', 'Event created!'); setTitle(''); setVenue(''); setDescription(''); setImageUri(null); }
      else Alert.alert('Error', data.message);
    } catch (e) { Alert.alert('Error', 'Server unreachable'); } finally { setIsPosting(false); }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    setScanned(true);
    try {
      const response = await fetch(`${API_URL}/checkin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registration_id: data })
      });
      const resData = await response.json();
      if (resData.success) Alert.alert('✅ Verified Registration!', resData.message, [{ text: 'Scan Next Ticket', onPress: () => setScanned(false) }]);
      else Alert.alert('❌ Error Scanning', resData.message, [{ text: 'Try Again', onPress: () => setScanned(false) }]);
    } catch (err) { Alert.alert('Network Error', 'Could not reach server.'); setScanned(false); }
  };

  const renderStats = () => (
    <View style={styles.scannerContainer}>
      <Text style={styles.dashboardSubtitle}>Live Event Analytics 📊</Text>
      {stats.length === 0 ? <ActivityIndicator size="large" color="#3182CE" /> : null}

      {stats.map(item => {
        const registered = item.total_registered || 0;
        const attended = item.total_attended || 0;
        const percentage = registered > 0 ? (attended / registered) * 100 : 0;

        return (
          <View key={item.event_id.toString()} style={styles.statCard}>
            <Text style={styles.eventTitle}>{item.title}</Text>
            <View style={styles.statRow}>
              <Text style={styles.statText}>👥 Registered: {registered}</Text>
              <Text style={styles.statText}>✅ Attended: {attended}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
            </View>

            {/* Now Opens the High-Performance Modal instead of lagging the screen! */}
            {attended > 0 && (
              <TouchableOpacity style={styles.viewAttendeesBtn} onPress={() => viewAttendees(item.event_id, item.title)}>
                <Text style={styles.viewAttendeesText}>View Checked-In Students ➔</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* ========================================================= */}
      {/* THE INFINITE-SCALING BUTTERY SMOOTH 1,000+ STUDENT FULL-SCREEN MODAL */}
      {/* ========================================================= */}
      <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F7FAFC' }}>
          
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsModalVisible(false)}><Text style={styles.closeBtn}>✕ Close</Text></TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>{selectedEventTitle}</Text>
            <TouchableOpacity onPress={exportToCSV}><Text style={styles.downloadBtn}>⬇️ CSV</Text></TouchableOpacity>
          </View>

          <View style={styles.modalSubHeader}>
            <Text style={styles.statText}>Total Checked-In: {attendeesList.length}</Text>
          </View>

          {/* FLATLIST MAGIC: Flawlessly renders 10,000+ items without a single lag drop! */}
          <FlatList
            data={attendeesList}
            keyExtractor={(item, index) => index.toString()}
            style={{ width: '100%', paddingHorizontal: 20 }}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={styles.attendeeRow}>
                <Text style={styles.attendeeName}>👤 {item.name}</Text>
                <Text style={styles.attendeeEmail}>✉️ {item.email}</Text>
              </View>
            )}
          />

        </SafeAreaView>
      </Modal>
    </View>
  );

  const renderScanner = () => {
    if (!permission) return <ActivityIndicator style={{ marginTop: 20 }} size="large" />;
    if (!permission.granted) {
      return (
        <View style={styles.permissionContainer}>
          <Text style={styles.dateLabel}>We need your permission to launch the camera!</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}><Text style={styles.buttonText}>Grant Access</Text></TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.scannerContainer}>
        <Text style={styles.dashboardSubtitle}>Point camera at a Student's QR Ticket!</Text>
        <View style={styles.cameraFrame}>
          <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} />
        </View>
        {scanned && <TouchableOpacity style={styles.scanButton} onPress={() => setScanned(false)}><Text style={styles.buttonText}>Tap to Scan Next</Text></TouchableOpacity>}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.dashboardScrollContainer}>
      <Text style={styles.dashboardTitle}>Organizer Hub</Text>
      <Text style={styles.dashboardSubtitle}>Manage events natively, {userName}!</Text>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabButton, viewMode === 'create' && styles.tabActive]} onPress={() => setViewMode('create')}>
          <Text style={viewMode === 'create' ? styles.tabActiveText : styles.tabInactiveText}>Create Event</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, viewMode === 'scan' && styles.tabActive]} onPress={() => setViewMode('scan')}>
          <Text style={viewMode === 'scan' ? styles.tabActiveText : styles.tabInactiveText}>Scan Tickets</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, viewMode === 'stats' && styles.tabActive]} onPress={() => setViewMode('stats')}>
          <Text style={viewMode === 'stats' ? styles.tabActiveText : styles.tabInactiveText}>Live Stats</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'create' ? (
        <View style={styles.formCard}>
          <TextInput style={styles.input} placeholder="Event Title" value={title} onChangeText={setTitle} />
          <TextInput style={styles.input} placeholder="Description" value={description} onChangeText={setDescription} multiline />
          <TextInput style={styles.input} placeholder="Venue" value={venue} onChangeText={setVenue} />
          <TextInput style={styles.input} placeholder="Participant Limit" value={limit} onChangeText={setLimit} keyboardType="numeric" />
          <Text style={styles.dateLabel}>Event Poster:</Text>
          <TouchableOpacity style={styles.uploadButton} onPress={pickImage}><Text style={styles.uploadButtonText}>{imageUri ? '🖼️ Change Gallery Image' : '📸 Pick Gallery Cover'}</Text></TouchableOpacity>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />}

          <Text style={styles.dateLabel}>Event Date & Time:</Text>
          <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}><Text style={styles.datePickerText}>📅 {date.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}</Text></TouchableOpacity>
          {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />}
          {showTimePicker && <DateTimePicker value={date} mode="time" display="default" onChange={onChangeTime} />}
          <TouchableOpacity style={styles.button} onPress={handleCreateEvent} disabled={isPosting}>
            {isPosting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Publish Event</Text>}
          </TouchableOpacity>
        </View>
      ) : viewMode === 'scan' ? (
        renderScanner()
      ) : (
        renderStats()
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={() => navigation.replace('Login')}><Text style={styles.buttonText}>Log Out</Text></TouchableOpacity>
    </ScrollView>
  );
}




// 3. Our Login/Signup Screen
function LoginScreen({ navigation }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [role, setRole] = useState('student'); const [isLoginMode, setIsLoginMode] = useState(true); const [isLoading, setIsLoading] = useState(false);
  const API_URL = 'http://10.118.76.100:3000/api';

  const handleAuthentication = async () => {
    if (!email || !password || (!isLoginMode && !name)) { Alert.alert('Hold on!', 'Please fill out all fields.'); return; }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}${isLoginMode ? '/login' : '/signup'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isLoginMode ? { email, password } : { name, email, password, role }),
      });
      const data = await response.json();
      if (data.success) {
        if (isLoginMode) {
          if (data.user.role === 'student') navigation.replace('Student', { userName: data.user.name, userId: data.user.id });
          else if (data.user.role === 'organizer') navigation.replace('Organizer', { userName: data.user.name });
        } else { Alert.alert('Success!', data.message); setIsLoginMode(true); }
      } else Alert.alert('Oops!', data.message || 'Something went wrong.');
    } catch (e) { Alert.alert('Error', 'Server unreachable'); } finally { setIsLoading(false); }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ClubCascade</Text>
      <Text style={styles.subtitle}>Your College Event Hub</Text>
      <Text style={styles.headerText}>{isLoginMode ? 'Welcome Back!' : 'Create an Account'}</Text>
      {!isLoginMode && <TextInput style={styles.input} placeholder="Full Name" value={name} onChangeText={setName} />}
      <TextInput style={styles.input} placeholder="College Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry={true} />
      {!isLoginMode && (
        <View style={styles.roleContainer}>
          <Text style={styles.roleText}>I am registering as a:</Text>
          <View style={styles.roleButtons}>
            <TouchableOpacity style={[styles.roleSelectBtn, role === 'student' && styles.roleActive]} onPress={() => setRole('student')}><Text style={role === 'student' ? styles.roleActiveText : styles.roleInactiveText}>Student</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.roleSelectBtn, role === 'organizer' && styles.roleActive]} onPress={() => setRole('organizer')}><Text style={role === 'organizer' ? styles.roleActiveText : styles.roleInactiveText}>Organizer</Text></TouchableOpacity>
          </View>
        </View>
      )}
      <TouchableOpacity style={styles.button} onPress={handleAuthentication} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{isLoginMode ? 'Login' : 'Sign Up Securely'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={styles.switchModeButton}><Text style={styles.switchModeText}>{isLoginMode ? "Don't have an account? Sign up here." : "Already have an account? Log in."}</Text></TouchableOpacity>
    </View>
  );
}

// 4. Router
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Student" component={StudentDashboard} />
        <Stack.Screen name="Organizer" component={OrganizerDashboard} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// 5. Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dashboardContainer: { flex: 1, backgroundColor: '#F5F7FA', alignItems: 'center', padding: 20, paddingTop: 60 },
  dashboardScrollContainer: { flexGrow: 1, backgroundColor: '#F5F7FA', alignItems: 'center', padding: 20, paddingTop: 60 },
  formCard: { width: '100%', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 20 },

  /* Tab Bar Styles */
  tabContainer: { flexDirection: 'row', backgroundColor: '#E2E8F0', padding: 4, borderRadius: 12, marginBottom: 20, width: '100%' },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  tabActiveText: { color: '#2B6CB0', fontWeight: 'bold', fontSize: 16 },
  tabInactiveText: { color: '#718096', fontWeight: 'bold', fontSize: 16 },

  /* QR Ticket Styles */
  qrContainer: { alignItems: 'center', marginTop: 15, padding: 15, backgroundColor: '#F7FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  qrText: { fontSize: 14, color: '#4A5568', fontWeight: 'bold', marginBottom: 15 },
  qrWrapper: { padding: 10, backgroundColor: '#FFF', borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  ticketIdText: { fontSize: 16, color: '#2D3748', marginTop: 15, fontWeight: 'bold', letterSpacing: 1 },

  /* Scanner Styles */
  permissionContainer: { width: '100%', alignItems: 'center', backgroundColor: '#FFF', padding: 20, borderRadius: 15, elevation: 3, marginBottom: 20 },
  scannerContainer: { width: '100%', alignItems: 'center', backgroundColor: '#FFF', padding: 20, borderRadius: 15, elevation: 3, marginBottom: 20 },
  cameraFrame: { width: 300, height: 300, borderRadius: 20, overflow: 'hidden', borderWidth: 4, borderColor: '#3182CE', marginBottom: 20 },
  scanButton: { backgroundColor: '#E53E3E', padding: 15, borderRadius: 10, alignItems: 'center', width: '80%' },

  /* Analytics Styles */
  statCard: { width: '100%', backgroundColor: '#F7FAFC', padding: 20, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
  statText: { fontSize: 16, color: '#4A5568', fontWeight: 'bold' },
  progressBarBg: { width: '100%', height: 12, backgroundColor: '#E2E8F0', borderRadius: 6, overflow: 'hidden', marginTop: 5 },
  progressBarFill: { height: '100%', backgroundColor: '#48BB78', borderRadius: 6 },

  /* Dropdown Attendee List Styles */
  viewAttendeesBtn: { marginTop: 15, alignSelf: 'center', backgroundColor: '#EBF8FF', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, borderWidth: 1, borderColor: '#BEE3F8' },
  viewAttendeesText: { color: '#2B6CB0', fontWeight: 'bold', fontSize: 14 },
  attendeesList: { marginTop: 15, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 15 },
  attendeeRow: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#EDF2F7', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  attendeeName: { fontWeight: 'bold', color: '#2D3748', fontSize: 15 },
  attendeeEmail: { color: '#718096', fontSize: 13, marginTop: 4 },

  /* Modal Styles */
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginTop: 30 },
  closeBtn: { fontSize: 16, color: '#E53E3E', fontWeight: 'bold' },
  downloadBtn: { fontSize: 16, color: '#38A169', fontWeight: 'bold' },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#2D3748', maxWidth: '50%' },
  modalSubHeader: { backgroundColor: '#EBF8FF', padding: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#BEE3F8', marginBottom: 10 },


  /* Existing Styles */
  uploadButton: { backgroundColor: '#E2E8F0', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#CBD5E0', borderStyle: 'dashed' },
  uploadButtonText: { color: '#4A5568', fontSize: 16, fontWeight: 'bold' },
  previewImage: { width: '100%', height: 120, borderRadius: 10, marginBottom: 15 },
  eventCard: { width: '100%', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 15 },
  eventImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 15, backgroundColor: '#E2E8F0' },
  eventTitle: { fontSize: 24, fontWeight: 'bold', color: '#2D3748', marginBottom: 5 },
  eventDate: { fontSize: 16, color: '#E53E3E', fontWeight: '600', marginBottom: 5 },
  eventVenue: { fontSize: 16, color: '#4A5568', marginBottom: 10 },
  eventDesc: { fontSize: 15, color: '#718096', marginBottom: 15, lineHeight: 22 },
  registerButton: { width: '100%', backgroundColor: '#48BB78', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  noEventsText: { fontSize: 16, color: '#718096', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  dateLabel: { color: '#4A5568', fontWeight: 'bold', marginBottom: 5, marginTop: 5 },
  datePickerButton: { backgroundColor: '#edf2f7', padding: 15, borderRadius: 10, marginBottom: 15, alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e0' },
  datePickerText: { color: '#2A4365', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 36, fontWeight: 'bold', color: '#2A4365' },
  subtitle: { fontSize: 16, color: '#4A5568', marginBottom: 20 },
  dashboardTitle: { fontSize: 30, fontWeight: 'bold', color: '#2A4365' },
  dashboardSubtitle: { fontSize: 18, color: '#4A5568', marginTop: 5, marginBottom: 20, textAlign: 'center' },
  headerText: { fontSize: 20, fontWeight: '600', color: '#2D3748', marginBottom: 20, alignSelf: 'flex-start', width: '100%' },
  input: { width: '100%', backgroundColor: '#F7FAFC', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16 },
  button: { width: '100%', backgroundColor: '#3182CE', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  logoutButton: { width: '100%', backgroundColor: '#E53E3E', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  switchModeButton: { marginTop: 20, padding: 10 },
  switchModeText: { color: '#3182CE', fontSize: 14, fontWeight: '500' },
  roleContainer: { width: '100%', marginBottom: 15 },
  roleText: { color: '#4A5568', marginBottom: 5, fontWeight: '600' },
  roleButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  roleSelectBtn: { flex: 0.48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#3182CE', alignItems: 'center' },
  roleActive: { backgroundColor: '#3182CE' },
  roleActiveText: { color: '#FFF', fontWeight: 'bold' },
  roleInactiveText: { color: '#3182CE', fontWeight: 'bold' },
});
