import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';

export default function App() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student'); // Default to student
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Connection to your computer's local IP address
  const API_URL = 'http://10.118.76.100:3000/api';

  const handleAuthentication = async () => {
    if (!email || !password || (!isLoginMode && !name)) {
      Alert.alert('Hold on!', 'Please fill out all the fields.');
      return;
    }

    setIsLoading(true);
    const endpoint = isLoginMode ? '/login' : '/signup';

    // Package the data depending on login or signup
    const requestData = isLoginMode
      ? { email, password }
      : { name, email, password, role };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (data.success) {
        Alert.alert('Success!', data.message);
      } else {
        Alert.alert('Oops!', data.message || 'Something went wrong.');
      }
    } catch (error) {
      console.error(error);
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

      {/* Put 'Name' input here only if they are signing up */}
      {!isLoginMode && (
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="College Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={true}
      />

      {/* Role Picker (Only show on Signup) */}
      {!isLoginMode && (
        <View style={styles.roleContainer}>
          <Text style={styles.roleText}>I am registering as a:</Text>
          <View style={styles.roleButtons}>
            <TouchableOpacity
              style={[styles.roleSelectBtn, role === 'student' && styles.roleActive]}
              onPress={() => setRole('student')}
            >
              <Text style={role === 'student' ? styles.roleActiveText : styles.roleInactiveText}>Student</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleSelectBtn, role === 'organizer' && styles.roleActive]}
              onPress={() => setRole('organizer')}
            >
              <Text style={role === 'organizer' ? styles.roleActiveText : styles.roleInactiveText}>Organizer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Submit Button */}
      <TouchableOpacity style={styles.button} onPress={handleAuthentication} disabled={isLoading}>
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>{isLoginMode ? 'Login' : 'Sign Up Securely'}</Text>
        )}
      </TouchableOpacity>

      {/* Switch between Login and Signup */}
      <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={styles.switchModeButton}>
        <Text style={styles.switchModeText}>
          {isLoginMode ? "Don't have an account? Sign up here." : "Already have an account? Log in."}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  title: { fontSize: 36, fontWeight: 'bold', color: '#2A4365' },
  subtitle: { fontSize: 16, color: '#4A5568', marginBottom: 30 },
  headerText: { fontSize: 20, fontWeight: '600', color: '#2D3748', marginBottom: 20, alignSelf: 'flex-start', width: '100%' },
  input: { width: '100%', backgroundColor: '#F7FAFC', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16 },
  button: { width: '100%', backgroundColor: '#3182CE', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  switchModeButton: { marginTop: 20, padding: 10 },
  switchModeText: { color: '#3182CE', fontSize: 14, fontWeight: '500' },

  /* Role Selector Styles */
  roleContainer: { width: '100%', marginBottom: 15 },
  roleText: { color: '#4A5568', marginBottom: 5, fontWeight: '600' },
  roleButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  roleSelectBtn: { flex: 0.48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#3182CE', alignItems: 'center' },
  roleActive: { backgroundColor: '#3182CE' },
  roleActiveText: { color: '#FFF', fontWeight: 'bold' },
  roleInactiveText: { color: '#3182CE', fontWeight: 'bold' },
});
