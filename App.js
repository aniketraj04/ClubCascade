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
import { io } from 'socket.io-client'; // NEW: WebSocket driver!

const Stack = createNativeStackNavigator();

// 1. The Student Dashboard (Now featuring My QR Tickets!)
function StudentDashboard({ route, navigation }) {
  const { userName, userId } = route.params;
  const [events, setEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [myTickets, setMyTickets] = useState([]); // Holds the registered tickets!
  const [isLoading, setIsLoading] = useState(true);

  // NEW: Real-Time Alerts State
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // NEW: Determines if they are looking at "Discover", "My Tickets", or "Alerts"
  const [viewMode, setViewMode] = useState('events');

  // NEW: Event Details & Q&A Board State
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventQueries, setEventQueries] = useState([]);
  const [newQueryMessage, setNewQueryMessage] = useState('');

  // NEW: Filter State 
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const EVENT_CATEGORIES = ["All Categories", "General", "Tech", "Arts", "Sports", "Party", "Workshop"];

  const API_URL = 'http://10.126.236.100:3000/api';
  const SOCKET_URL = 'http://10.126.236.100:3000'; // Our new Streaming port!

  // ===================================
  // NEW: The WebSockets Brain!
  // ===================================
  useEffect(() => {
    // 1. Fetch their history immediately on load
    fetchNotifications();

    // 2. Secretly connect to the backend WebSockets server
    const socket = io(SOCKET_URL);

    // 3. Listen for the Live Broadcast drop from Organizers!
    socket.on('new_event_alert', (data) => {
      // Vibrate/Pop up an instant native alert!
      Alert.alert('🚨 LIVE EVENT DROP', data.message);

      // We magically fetch their updated list without refreshing!
      fetchNotifications();
    });

    // 4. NEW: Listen for Live Chat Messages on the Q&A Board
    socket.on('new_event_query', (newQuery) => {
      // Magically inject new chat messages exactly into the array in real-time
      setEventQueries((prev) => [...prev, newQuery]);
    });

    // Cleanup connection when they log out
    return () => socket.disconnect();
  }, []);

  // Automatically fetch data depending on which tab they clicked
  useEffect(() => {
    if (viewMode === 'events') fetchEvents();
    else if (viewMode === 'tickets') fetchMyTickets();
    else if (viewMode === 'alerts') fetchNotifications();
  }, [viewMode]);

  // NEW: Loads their inbox and calculates unread badges!
  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${API_URL}/notifications/${userId}`);
      const data = await response.json();
      if (data.success) {
        setNotifications(data.notifications);
        const unread = data.notifications.filter(n => !n.is_read).length;
        setUnreadCount(unread);
      }
    } catch (err) { console.error("Error fetching alerts", err); }
  };

  // NEW: Mark as read when they tap an alert!
  const handleMarkAsRead = async (notificationId) => {
    try {
      await fetch(`${API_URL}/notifications/read/${notificationId}`, { method: 'POST' });
      fetchNotifications(); // Refresh to clear the red dot!
    } catch (err) { }
  };

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

  // NEW: Cancel Registration Function (With Safety Alert!)
  const handleCancelRegistration = (registrationId) => {
    Alert.alert(
      "Cancel Ticket?",
      "Are you sure you want to withdraw from this event? Your spot will be permanently lost.",
      [
        { text: "Nevermind", style: "cancel" },
        { 
          text: "Yes, Cancel It", 
          style: "destructive",
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/cancel-registration/${registrationId}`, { method: 'DELETE' });
              const data = await response.json();
              if (data.success) {
                Alert.alert("Ticket Withdrawn", data.message);
                fetchMyTickets(); // Automatically refreshes the UI list!
              } else {
                Alert.alert("Error", data.message);
              }
            } catch (err) { Alert.alert("Error", "Server unreachable."); }
          }
        }
      ]
    );
  };

  // NEW: Opens the Full-Screen Native Experience
  const openEventDetails = async (event) => {
    setSelectedEvent(event);
    setIsDetailsModalVisible(true);
    try {
      const response = await fetch(`${API_URL}/queries/${event.event_id}`);
      const data = await response.json();
      if (data.success) setEventQueries(data.queries);
    } catch (err) { console.error(err); }
  };

  // NEW: Instant Post Chat Message
  const handlePostQuery = async () => {
    if (!newQueryMessage.trim()) return;
    try {
      const response = await fetch(`${API_URL}/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: selectedEvent.event_id, user_id: userId, user_name: userName, message: newQueryMessage })
      });
      const data = await response.json();
      if (data.success) setNewQueryMessage(''); // Clear input natively!
    } catch (err) { console.error(err); }
  };

  // UI for Discovering Events
  const renderEvent = ({ item }) => (
    <TouchableOpacity style={styles.eventCard} activeOpacity={0.9} onPress={() => openEventDetails(item)}>
      {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.eventImage} resizeMode="cover" /> : null}
      <Text style={styles.eventTitle}>{item.title}</Text>
      <Text style={styles.eventDate}>📅 {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      <Text style={styles.eventVenue}>📍 {item.venue}</Text>
      {item.description ? <Text style={styles.eventDesc}>{item.description}</Text> : null}

      <TouchableOpacity style={styles.registerButton} onPress={() => handleRegister(item.event_id)}>
        <Text style={styles.buttonText}>Register for Event</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // UI for Showing their QR Code Ticket!
  const renderTicket = ({ item }) => (
    <View style={styles.eventCard}>
      {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.eventImage} resizeMode="cover" /> : null}
      <Text style={styles.eventTitle}>{item.title}</Text>
      <Text style={styles.eventDate}>📅 {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      <Text style={styles.eventVenue}>📍 {item.venue}</Text>

      {/* NEW: Dynamic Attendance Badges! */}
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        {item.attended === 1 ? (
          <View style={{ backgroundColor: '#C6F6D5', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#48BB78' }}>
            <Text style={{ color: '#2F855A', fontWeight: 'bold' }}>✅ Verified Attendance</Text>
          </View>
        ) : new Date(item.date) < new Date() ? (
          <View style={{ backgroundColor: '#FED7D7', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F56565' }}>
            <Text style={{ color: '#C53030', fontWeight: 'bold' }}>❌ Missed Event</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: '#EBF8FF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#4299E1' }}>
            <Text style={{ color: '#2B6CB0', fontWeight: 'bold' }}>🎟️ Upcoming Event</Text>
          </View>
        )}
      </View>

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

      {/* NEW: The big red Cancel button! */}
      <TouchableOpacity 
        style={[styles.registerButton, { backgroundColor: '#E53E3E', marginTop: 15 }]} 
        onPress={() => handleCancelRegistration(item.registration_id)}
      >
        <Text style={styles.buttonText}>❌ Withdraw Ticket</Text>
      </TouchableOpacity>
    </View>
  );

  // NEW: UI for Displaying an individual Alert!
  const renderAlert = ({ item }) => (
    <TouchableOpacity
      style={[styles.alertCard, !item.is_read && styles.alertCardUnread]}
      onPress={() => handleMarkAsRead(item.notification_id)}
    >
      <Text style={styles.alertText}>{item.message}</Text>
      <Text style={styles.alertDate}>
        {new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
      </Text>
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  // NEW: Master Filter System (Checks Category THEN Text Match)
  const filteredEvents = events.filter(e => 
    (selectedCategory === "All Categories" || e.category === selectedCategory) &&
    e.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.dashboardContainer}>
      <Text style={styles.dashboardTitle}>Student Dashboard 🎓</Text>
      
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabButton, viewMode === 'events' && styles.tabActive]} onPress={() => setViewMode('events')}>
          <Text style={viewMode === 'events' ? styles.tabActiveText : styles.tabInactiveText}>Discover</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tabButton, viewMode === 'tickets' && styles.tabActive]} onPress={() => setViewMode('tickets')}>
          <Text style={viewMode === 'tickets' ? styles.tabActiveText : styles.tabInactiveText}>My Tickets</Text>
        </TouchableOpacity>

        {/* NEW: The Live Notifications Tab! */}
        <TouchableOpacity style={[styles.tabButton, viewMode === 'alerts' && styles.tabActive]} onPress={() => { setViewMode('alerts'); fetchNotifications(); }}>
          <Text style={viewMode === 'alerts' ? styles.tabActiveText : styles.tabInactiveText}>
            Alerts {unreadCount > 0 ? `(${unreadCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'events' && (
        <View style={{ width: '100%' }}>
          <TextInput
            style={[styles.input, { marginBottom: 15 }]}
            placeholder="🔍 Search for an event title..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          
          {/* NEW: Category Scroller Native Interface */}
          <View style={{ marginBottom: 15 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 5 }}>
              {EVENT_CATEGORIES.map(cat => (
                <TouchableOpacity 
                  key={cat} 
                  onPress={() => setSelectedCategory(cat)}
                  style={{ 
                    backgroundColor: selectedCategory === cat ? '#2B6CB0' : '#E2E8F0', 
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10 
                  }}>
                  <Text style={{ color: selectedCategory === cat ? '#FFF' : '#4A5568', fontWeight: 'bold' }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator size="large" color="#3182CE" style={{ marginTop: 50 }} />
      ) : viewMode === 'events' && events.length === 0 ? (
        <Text style={styles.noEventsText}>No upcoming events found.</Text>
      ) : viewMode === 'tickets' && myTickets.length === 0 ? (
        <Text style={styles.noEventsText}>You haven't registered for any events yet!</Text>
      ) : viewMode === 'alerts' && notifications.length === 0 ? (
        <Text style={styles.noEventsText}>Your inbox is empty. No alerts yet!</Text>
      ) : (
        <FlatList
          data={viewMode === 'events' ? filteredEvents : (viewMode === 'tickets' ? myTickets : notifications)}

          keyExtractor={(item) => (
            viewMode === 'events' ? item.event_id.toString() :
              viewMode === 'tickets' ? item.registration_id.toString() :
                item.notification_id.toString()
          )}
          renderItem={viewMode === 'events' ? renderEvent : (viewMode === 'tickets' ? renderTicket : renderAlert)}
          style={{ width: '100%' }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ========================================================= */}
      {/* NEW: THE EVENT DETAILS & LIVE CHAT MODAL */}
      {/* ========================================================= */}
      {selectedEvent && (
        <Modal visible={isDetailsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsDetailsModalVisible(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#F7FAFC' }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setIsDetailsModalVisible(false)}><Text style={styles.closeBtn}>✕ Close</Text></TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedEvent.title}</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {selectedEvent.image_url && <Image source={{ uri: selectedEvent.image_url }} style={styles.eventImage} resizeMode="cover" />}
              <Text style={styles.eventTitle}>{selectedEvent.title}</Text>
              <Text style={styles.eventDate}>📅 {new Date(selectedEvent.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              <Text style={styles.eventVenue}>📍 {selectedEvent.venue}</Text>
              {selectedEvent.description && <Text style={styles.eventDesc}>{selectedEvent.description}</Text>}

              <TouchableOpacity style={[styles.registerButton, { marginTop: 20, marginBottom: 30 }]} onPress={() => handleRegister(selectedEvent.event_id)}>
                <Text style={styles.buttonText}>Register Instantly</Text>
              </TouchableOpacity>

              {/* LIVE Q&A BOARD */}
              <View style={{ borderTopWidth: 1, borderColor: '#E2E8F0', paddingTop: 20 }}>
                <Text style={styles.dashboardSubtitle}>Live Q&A Board</Text>
                
                {eventQueries.map((query, index) => (
                  <View key={index} style={{ backgroundColor: '#FFF', padding: 15, borderRadius: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 }}>
                    <Text style={{ fontWeight: 'bold', color: '#2B6CB0', marginBottom: 5 }}>{query.user_name}</Text>
                    <Text style={{ color: '#4A5568' }}>{query.message}</Text>
                  </View>
                ))}

                <View style={{ flexDirection: 'row', marginTop: 15, alignItems: 'center' }}>
                  <TextInput 
                    style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 10 }]} 
                    placeholder="Ask a question..." 
                    value={newQueryMessage}
                    onChangeText={setNewQueryMessage}
                  />
                  <TouchableOpacity style={[styles.button, { width: 80, marginTop: 0 }]} onPress={handlePostQuery}>
                    <Text style={styles.buttonText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
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
  const [limitParticipants, setLimitParticipants] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [viewMode, setViewMode] = useState('create');
  const [stats, setStats] = useState([]);
  
  // NEW: Organizer Categorization Scope
  const [category, setCategory] = useState("General");
  const ORGANIZER_CATEGORIES = ["General", "Tech", "Arts", "Sports", "Party", "Workshop"];

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // NEW: State to track which event's Attendee List is currently expanded!
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [attendeesList, setAttendeesList] = useState([]); // Holds the specific names/emails

  // NEW: State for the buttery-smooth Modal!
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedEventTitle, setSelectedEventTitle] = useState('');

  // ============================================
  // NEW: Organizer Command Center (Phase 8 State)
  // ============================================
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
  // ============================================

  const API_URL = 'http://10.126.236.100:3000/api';
  const SOCKET_URL = 'http://10.126.236.100:3000'; // Our new Streaming port!

  useEffect(() => {
    if (viewMode === 'stats') {
      fetch(`${API_URL}/stats`).then(r => r.json()).then(data => {
        if (data.success) setStats(data.stats);
      }).catch(err => console.error(err));
    } else if (viewMode === 'manage') {
      fetchOrganizerEvents();
    }
  }, [viewMode]);

  // Connect Organizer natively to WebSockets for real-time Chat Sync
  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on('new_event_query', (newQuery) => {
      setOrganizerQueries((prev) => [...prev, newQuery]);
    });
    return () => socket.disconnect();
  }, []);

  // NEW: Command Center Methods
  const fetchOrganizerEvents = async () => {
    try {
      const response = await fetch(`${API_URL}/events`);
      const data = await response.json();
      if (data.success) setManageEvents(data.events);
    } catch (err) { console.error(err); }
  };

  const executeDelete = async (eventId) => {
    Alert.alert("Destroy Event?", "Are you absolutely sure? This will wipe all registrations and chat history instantly.", [
      { text: "Cancel", style: "cancel" },
      { text: "Obliterate", style: "destructive", onPress: async () => {
          try {
            const response = await fetch(`${API_URL}/events/${eventId}`, { method: 'DELETE' });
            const data = await response.json();
            if (data.success) { Alert.alert("Success", data.message); fetchOrganizerEvents(); }
          } catch(err) { Alert.alert("Error", "Server unreachable."); }
      }}
    ]);
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
        // Automatically bundle physical file native path
        formData.append('poster', { uri: editImageUri, name: 'poster.jpg', type: 'image/jpeg' });
      } else {
        // Send the HTTP string backward intact
        formData.append('image_url', editImageUri || '');
      }

      const response = await fetch(`${API_URL}/events/${currentEventObj.event_id}`, {
        method: 'PUT',
        body: formData
      });
      const data = await response.json();
      if (data.success) { 
        Alert.alert("Updated!", data.message); 
        setIsEditModalVisible(false); 
        fetchOrganizerEvents(); 
      } else {
        Alert.alert("Error", data.message);
      }
    } catch(err) { Alert.alert("Error", "Server unreachable."); }
  };

  const openOrganizerChat = async (event) => {
    setCurrentEventObj(event);
    setIsChatVisible(true);
    try {
      const response = await fetch(`${API_URL}/queries/${event.event_id}`);
      const data = await response.json();
      if (data.success) setOrganizerQueries(data.queries);
    } catch (err) {}
  };

  const handleOrganizerReply = async () => {
    if (!replyMessage.trim()) return;
    try {
      const response = await fetch(`${API_URL}/queries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: currentEventObj.event_id, user_id: 1, user_name: `[Organizer] ${userName}`, message: replyMessage })
      });
      const data = await response.json();
      if (data.success) setReplyMessage('');
    } catch(err) {}
  };


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
      formData.append('title', title);
      formData.append('description', description);
      formData.append('date', formatDateTimeForMySQL(date));
      formData.append('venue', venue);
      formData.append('limit_participants', limitParticipants || 0);
      formData.append('category', category); // SEND CATEGORY TO DB!
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

      <View style={[styles.tabContainer, { flexWrap: 'wrap' }]}>
        <TouchableOpacity style={[styles.tabButton, viewMode === 'create' && styles.tabActive]} onPress={() => setViewMode('create')}>
          <Text style={viewMode === 'create' ? styles.tabActiveText : styles.tabInactiveText}>Create Event</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, viewMode === 'manage' && styles.tabActive]} onPress={() => setViewMode('manage')}>
          <Text style={viewMode === 'manage' ? styles.tabActiveText : styles.tabInactiveText}>Manage Hub</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, viewMode === 'scan' && styles.tabActive]} onPress={() => setViewMode('scan')}>
          <Text style={viewMode === 'scan' ? styles.tabActiveText : styles.tabInactiveText}>Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, viewMode === 'stats' && styles.tabActive]} onPress={() => setViewMode('stats')}>
          <Text style={viewMode === 'stats' ? styles.tabActiveText : styles.tabInactiveText}>Live Stats</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'create' ? (
        <View style={styles.formCard}>
          <TextInput style={styles.input} placeholder="Event Title" value={title} onChangeText={setTitle} />
          <TextInput style={styles.input} placeholder="Description" value={description} onChangeText={setDescription} multiline />
          <TextInput style={styles.input} placeholder="Venue/Location" value={venue} onChangeText={setVenue} />
          <TextInput style={styles.input} placeholder="Ticket/Capacity Limit (e.g. 50)" keyboardType="numeric" value={limitParticipants} onChangeText={setLimitParticipants} />
          
          <Text style={{ fontWeight: 'bold', marginTop: 10, marginBottom: 5 }}>Select Event Category:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {ORGANIZER_CATEGORIES.map(cat => (
              <TouchableOpacity 
                key={cat} 
                onPress={() => setCategory(cat)}
                style={{ 
                  backgroundColor: category === cat ? '#2B6CB0' : '#E2E8F0', 
                  paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, marginRight: 10 
                }}>
                <Text style={{ color: category === cat ? '#FFF' : '#2D3748', fontWeight: 'bold' }}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.uploadButton} onPress={pickImage}><Text style={styles.uploadButtonText}>{imageUri ? '🖼️ Change Gallery Image' : '📸 Pick Gallery Cover'}</Text></TouchableOpacity>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />}

          <Text style={styles.dateLabel}>Event Date & Time:</Text>
          <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}><Text style={styles.datePickerText}>📅 {date.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}</Text></TouchableOpacity>
          {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />}
          {showTimePicker && <DateTimePicker value={date} mode="time" display="default" onChange={onChangeTime} />}
          <TouchableOpacity style={styles.button} onPress={handleCreateEvent} disabled={isPosting}>
            {isPosting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Publish Event Instantly</Text>}
          </TouchableOpacity>
        </View>
      ) : viewMode === 'manage' ? (
        <View style={{ width: '100%' }}>
          <Text style={styles.dashboardSubtitle}>Command Center 🎛️</Text>
          {manageEvents.length === 0 ? <ActivityIndicator size="large" color="#3182CE" /> : null}
          
          {manageEvents.map(item => (
            <View key={item.event_id.toString()} style={styles.statCard}>
              <Text style={styles.eventTitle}>{item.title}</Text>
              <Text style={styles.eventDate}>📅 {new Date(item.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} | 📍 {item.venue}</Text>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#3182CE', padding: 10, marginRight: 5, marginTop: 0 }]} onPress={() => openEditModal(item)}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', textAlign: 'center' }}>🖍️ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#E53E3E', padding: 10, marginLeft: 5, marginTop: 0 }]} onPress={() => executeDelete(item.event_id)}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', textAlign: 'center' }}>❌ Delete</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.button, { backgroundColor: '#38A169', padding: 10, marginTop: 10 }]} onPress={() => openOrganizerChat(item)}>
                <Text style={{ color: '#FFF', fontWeight: 'bold', textAlign: 'center' }}>💬 Enter Q&A Hub</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : viewMode === 'scan' ? (
        renderScanner()
      ) : (
        renderStats()
      )}

      {/* ========================================================= */}
      {/* NEW: THE EDIT EVENT MODAL */}
      {/* ========================================================= */}
      <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsEditModalVisible(false)}><Text style={styles.closeBtn}>✕ Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>Edit Event</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <TextInput style={styles.input} placeholder="Title" value={editTitle} onChangeText={setEditTitle} />
            <TextInput style={styles.input} placeholder="Description" value={editDesc} onChangeText={setEditDesc} multiline />
            <TextInput style={styles.input} placeholder="Venue" value={editVenue} onChangeText={setEditVenue} />
            <TextInput style={styles.input} placeholder="Capacity" value={editLimit} onChangeText={setEditLimit} keyboardType="numeric" />
            
            <Text style={{ fontWeight: 'bold', marginTop: 10, marginBottom: 5 }}>Select Event Category:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              {ORGANIZER_CATEGORIES.map(cat => (
                <TouchableOpacity key={cat} onPress={() => setEditCategory(cat)} style={{ backgroundColor: editCategory === cat ? '#2B6CB0' : '#E2E8F0', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, marginRight: 10 }}>
                  <Text style={{ color: editCategory === cat ? '#FFF' : '#2D3748', fontWeight: 'bold' }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.uploadButton} onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.8 });
                if (!result.canceled) setEditImageUri(result.assets[0].uri);
            }}><Text style={styles.uploadButtonText}>{editImageUri ? '🖼️ Change Image' : '📸 Pick New Image'}</Text></TouchableOpacity>
            {editImageUri && <Image source={{ uri: editImageUri }} style={styles.previewImage} resizeMode="cover" />}

            <TouchableOpacity style={[styles.button, { marginTop: 20 }]} onPress={executeUpdate}><Text style={styles.buttonText}>Save Changes</Text></TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ========================================================= */}
      {/* NEW: THE ORGANIZER Q&A CHAT MODAL */}
      {/* ========================================================= */}
      <Modal visible={isChatVisible} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F7FAFC' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsChatVisible(false)}><Text style={styles.closeBtn}>✕ Close</Text></TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>Live Chat: {currentEventObj?.title}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={{ flex: 1, padding: 20 }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
              {organizerQueries.map((query, index) => (
                <View key={index} style={{ backgroundColor: query.user_name.includes('[Organizer]') ? '#EBF8FF' : '#FFF', padding: 15, borderRadius: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, borderWidth: query.user_name.includes('[Organizer]') ? 1 : 0, borderColor: '#63B3ED' }}>
                  <Text style={{ fontWeight: 'bold', color: query.user_name.includes('[Organizer]') ? '#2B6CB0' : '#2D3748', marginBottom: 5 }}>{query.user_name}</Text>
                  <Text style={{ color: '#4A5568' }}>{query.message}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 10, borderRadius: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 10, borderBottomWidth: 0, paddingLeft: 10 }]} placeholder="Reply to students..." value={replyMessage} onChangeText={setReplyMessage} />
              <TouchableOpacity style={[styles.button, { width: 80, marginTop: 0 }]} onPress={handleOrganizerReply}><Text style={styles.buttonText}>Send</Text></TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <TouchableOpacity style={styles.logoutButton} onPress={() => navigation.replace('Login')}><Text style={styles.buttonText}>Log Out</Text></TouchableOpacity>
    </ScrollView>
  );
}

// 3. Our Login/Signup Screen
function LoginScreen({ navigation }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [role, setRole] = useState('student'); const [isLoginMode, setIsLoginMode] = useState(true); const [isLoading, setIsLoading] = useState(false);
  const API_URL = 'http://10.126.236.100:3000/api';

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

  /* Notifications UI Styles */
  alertCard: { width: '100%', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#EDF2F7', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, position: 'relative' },
  alertCardUnread: { backgroundColor: '#EBF8FF', borderColor: '#90CDF4' },
  alertText: { fontSize: 16, color: '#2D3748', fontWeight: 'bold', marginBottom: 5, paddingRight: 20 },
  alertDate: { fontSize: 13, color: '#718096' },
  unreadDot: { position: 'absolute', top: 20, right: 15, width: 12, height: 12, borderRadius: 6, backgroundColor: '#E53E3E' },


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
