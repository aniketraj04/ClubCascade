import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, FlatList, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker'; // NEW: Mobile Gallery Access!

const Stack = createNativeStackNavigator();

// 1. The Student Dashboard (Supports Gorgeous Image Posters and Registration!)
function StudentDashboard({ route, navigation }) {
  // NEW: We now extract both the userName AND the userId so we know exactly who is registering!
  const { userName, userId } = route.params;
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const API_URL = 'http://10.118.76.100:3000/api';

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch(`${API_URL}/events`);
      const data = await response.json();
      if (data.success) {
        setEvents(data.events);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not load upcoming events.');
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: The function that talks to our latest Backend Registration API!
  const handleRegister = async (eventId) => {
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, event_id: eventId })
      });
      
      const rawText = await response.text();
      console.log("=== THE BACKEND CRASHED. HERE IS THE EXACT ERROR: ===");
      console.log(rawText);
      console.log("=====================================================");
      
      const data = JSON.parse(rawText);

      // If successful, or if they are already registered, show them the server's message!
      if (data.success) {
        Alert.alert('Registered! 🎉', data.message);
      } else {
        Alert.alert('Heads up', data.message);
      }
    } catch (error) {
      console.error("Fetch/JSON parse failed. (Check your Expo terminal for the rawText trace!)");
      Alert.alert('Network Error', 'Could not register for the event.');
    }
  };

  const renderEvent = ({ item }) => (
    <View style={styles.eventCard}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.eventImage} resizeMode="cover" />
      ) : null}

      <Text style={styles.eventTitle}>{item.title}</Text>
      <Text style={styles.eventDate}>📅 {new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      <Text style={styles.eventVenue}>📍 {item.venue}</Text>
      {item.description ? <Text style={styles.eventDesc}>{item.description}</Text> : null}

      {/* We tied the button straight to our handleRegister function, passing the exact event_id! */}
      <TouchableOpacity style={styles.registerButton} onPress={() => handleRegister(item.event_id)}>
        <Text style={styles.buttonText}>Register for Event</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.dashboardContainer}>
      <Text style={styles.dashboardTitle}>Student Dashboard</Text>
      <Text style={styles.dashboardSubtitle}>Hello {userName}! Check out these events:</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color="#3182CE" />
      ) : events.length === 0 ? (
        <Text style={styles.noEventsText}>No upcoming events found. Ask organizers to post some!</Text>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.event_id.toString()}
          renderItem={renderEvent}
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


// 2. Organizer Dashboard (Now with Image Pickers & File Uploads!)
function OrganizerDashboard({ route, navigation }) {
  const { userName } = route.params;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [limit, setLimit] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  // NEW: State for our locally picked image URI
  const [imageUri, setImageUri] = useState(null);

  // Native Date Picker logic
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const API_URL = 'http://10.118.76.100:3000/api';

  const onChangeDate = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDate(selectedDate);
      setTimeout(() => setShowTimePicker(true), 150);
    }
  };

  const onChangeTime = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const finalDate = new Date(date);
      finalDate.setHours(selectedTime.getHours());
      finalDate.setMinutes(selectedTime.getMinutes());
      setDate(finalDate);
    }
  };

  const formatDateTimeForMySQL = (d) => {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  // NEW: Function to request permission and open the phone's native gallery!
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission Denied', 'You need to allow gallery access to upload a poster!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, // Lets them crop it!
      aspect: [16, 9],     // Wide poster look
      quality: 0.8,        // Tiny compression for speed
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri); // Temporarily store the physical image path
    }
  };

  const handleCreateEvent = async () => {
    if (!title || !venue) {
      Alert.alert('Hold on', 'Title and Venue are strictly required!');
      return;
    }
    setIsPosting(true);

    try {
      // Because we are uploading a massive physical image file, we CANNOT use simple JSON.
      // We must use a Multipart FormData object (just like passing a real file!)
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('date', formatDateTimeForMySQL(date));
      formData.append('venue', venue);
      formData.append('limit_participants', limit ? parseInt(limit) : 0);

      // If they selected a locally saved image from the gallery:
      if (imageUri) {
        const localUri = imageUri;
        const filename = localUri.split('/').pop();

        // Find out the file extension (like .jpg or .png)
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image`;

        formData.append('poster', {
          uri: localUri,
          name: filename,
          type: type
        });
      }

      // No 'headers' needed! fetch() automatically sets boundary markers for FormData
      const response = await fetch(`${API_URL}/events`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        Alert.alert('Success!', 'The Event and Gallery Poster have been published!');
        setTitle(''); setDescription(''); setVenue(''); setLimit('');
        setImageUri(null); // Clear the tiny preview
        setDate(new Date());
      } else {
        Alert.alert('Error', data.message || 'Could not create event');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Network Error', 'Could not reach server.');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.dashboardScrollContainer}>
      <Text style={styles.dashboardTitle}>Organizer Hub</Text>
      <Text style={styles.dashboardSubtitle}>Post a beautiful new event, {userName}!</Text>

      <View style={styles.formCard}>
        <TextInput style={styles.input} placeholder="Event Title" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input} placeholder="Description (Optional)" value={description} onChangeText={setDescription} multiline />
        <TextInput style={styles.input} placeholder="Venue (e.g. Main Hall)" value={venue} onChangeText={setVenue} />
        <TextInput style={styles.input} placeholder="Participant Limit (0 for unlimited)" value={limit} onChangeText={setLimit} keyboardType="numeric" />

        {/* NEW: Upload Gallery Button */}
        <Text style={styles.dateLabel}>Event Poster:</Text>
        <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
          <Text style={styles.uploadButtonText}>
            {imageUri ? '🖼️ Change Gallery Image' : '📸 Pick Image from Gallery'}
          </Text>
        </TouchableOpacity>

        {/* Show a tiny preview of what they picked before they hit publish! */}
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
        )}

        {/* Date & Time Picker UI */}
        <Text style={styles.dateLabel}>Event Date & Time:</Text>
        <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.datePickerText}>📅 {date.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}</Text>
        </TouchableOpacity>

        {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />}
        {showTimePicker && <DateTimePicker value={date} mode="time" display="default" onChange={onChangeTime} />}

        <TouchableOpacity style={styles.button} onPress={handleCreateEvent} disabled={isPosting}>
          {isPosting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Publish Event</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={() => navigation.replace('Login')}>
        <Text style={styles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// 3. Our Login/Signup Screen
function LoginScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const API_URL = 'http://10.118.76.100:3000/api';

  const handleAuthentication = async () => {
    if (!email || !password || (!isLoginMode && !name)) {
      Alert.alert('Hold on!', 'Please fill out all the fields.');
      return;
    }
    setIsLoading(true);
    const endpoint = isLoginMode ? '/login' : '/signup';
    const requestData = isLoginMode ? { email, password } : { name, email, password, role };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData),
      });
      const data = await response.json();
      if (data.success) {
        if (isLoginMode) {
          const userRole = data.user.role;
          if (userRole === 'student') navigation.replace('Student', { userName: data.user.name, userId: data.user.id });
          else if (userRole === 'organizer') navigation.replace('Organizer', { userName: data.user.name });
        } else {
          Alert.alert('Success!', data.message);
          setIsLoginMode(true);
        }
      } else Alert.alert('Oops!', data.message || 'Something went wrong.');
    } catch (error) {
      Alert.alert('Network Error', 'Could not connect to the Backend server.');
    } finally {
      setIsLoading(false);
    }
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
            <TouchableOpacity style={[styles.roleSelectBtn, role === 'student' && styles.roleActive]} onPress={() => setRole('student')}>
              <Text style={role === 'student' ? styles.roleActiveText : styles.roleInactiveText}>Student</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roleSelectBtn, role === 'organizer' && styles.roleActive]} onPress={() => setRole('organizer')}>
              <Text style={role === 'organizer' ? styles.roleActiveText : styles.roleInactiveText}>Organizer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <TouchableOpacity style={styles.button} onPress={handleAuthentication} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{isLoginMode ? 'Login' : 'Sign Up Securely'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={styles.switchModeButton}>
        <Text style={styles.switchModeText}>{isLoginMode ? "Don't have an account? Sign up here." : "Already have an account? Log in."}</Text>
      </TouchableOpacity>
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

  /* Upload Buttons */
  uploadButton: { backgroundColor: '#E2E8F0', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#CBD5E0', borderStyle: 'dashed' },
  uploadButtonText: { color: '#4A5568', fontSize: 16, fontWeight: 'bold' },
  previewImage: { width: '100%', height: 120, borderRadius: 10, marginBottom: 15 },

  /* Upgraded Event Card Styles */
  eventCard: { width: '100%', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 15 },
  eventImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 15, backgroundColor: '#E2E8F0' },
  eventTitle: { fontSize: 24, fontWeight: 'bold', color: '#2D3748', marginBottom: 5 },
  eventDate: { fontSize: 16, color: '#E53E3E', fontWeight: '600', marginBottom: 5 },
  eventVenue: { fontSize: 16, color: '#4A5568', marginBottom: 10 },
  eventDesc: { fontSize: 15, color: '#718096', marginBottom: 15, lineHeight: 22 },
  registerButton: { width: '100%', backgroundColor: '#48BB78', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  noEventsText: { fontSize: 16, color: '#718096', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },

  /* Upgraded Form / Date Picker Styles */
  dateLabel: { color: '#4A5568', fontWeight: 'bold', marginBottom: 5, marginTop: 5 },
  datePickerButton: { backgroundColor: '#edf2f7', padding: 15, borderRadius: 10, marginBottom: 15, alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e0' },
  datePickerText: { color: '#2A4365', fontSize: 16, fontWeight: '600' },

  title: { fontSize: 36, fontWeight: 'bold', color: '#2A4365' },
  subtitle: { fontSize: 16, color: '#4A5568', marginBottom: 30 },
  dashboardTitle: { fontSize: 30, fontWeight: 'bold', color: '#2A4365' },
  dashboardSubtitle: { fontSize: 18, color: '#4A5568', marginTop: 10, marginBottom: 30, textAlign: 'center' },
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
