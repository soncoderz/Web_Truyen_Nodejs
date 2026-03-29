import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import StoryList from './pages/StoryList';
import StoryDetail from './pages/StoryDetail';
import ChapterReader from './pages/ChapterReader';
import Profile from './pages/Profile';
import UserProfile from './pages/UserProfile';
import Admin from './pages/Admin';
import Statistics from './pages/Statistics';
import CreatorStudio from './pages/CreatorStudio';
import Leaderboard from './pages/Leaderboard';
import ToastViewport from './components/ToastViewport';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <ToastViewport />
          <Header />
          <main style={{ minHeight: 'calc(100vh - 130px)' }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/stories" element={<StoryList />} />
              <Route path="/story/:id" element={<StoryDetail />} />
              <Route path="/story/:storyId/chapter/:chapterId" element={<ChapterReader />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/users/:id" element={<UserProfile />} />
              <Route path="/studio" element={<CreatorStudio />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/statistics" element={<Statistics />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
            </Routes>
          </main>
          <Footer />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
