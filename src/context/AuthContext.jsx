import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { toLanguageLabel } from '../constants/languages'

const AuthContext = createContext()

const defaultProfile = (user) => ({
  email: user.email || '',
  createdAt: serverTimestamp(),
  knownWords: [],
  targetLanguages: [],
  myLanguages: [],
  lastUsedLanguage: '',
  nativeLanguage: '',
  stories: [],
  displayName: user.displayName || '',
})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const buildProfile = useCallback(async (authUser) => {
    const userRef = doc(db, 'users', authUser.uid)
    await setDoc(userRef, defaultProfile(authUser), { merge: true })
    const snapshot = await getDoc(userRef)
    setProfile(snapshot.data())
    return snapshot.data()
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser)
      if (authUser) {
        const userRef = doc(db, 'users', authUser.uid)
        const snapshot = await getDoc(userRef)
        if (snapshot.exists()) {
          setProfile(snapshot.data())
        } else {
          await buildProfile(authUser)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [buildProfile])

  const signup = useCallback(
    async (email, password) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      const userProfile = await buildProfile(credential.user)
      return { user: credential.user, profile: userProfile }
    },
    [buildProfile]
  )

  const login = useCallback(async (email, password) => {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const userRef = doc(db, 'users', credential.user.uid)
    const snapshot = await getDoc(userRef)
    if (snapshot.exists()) {
      setProfile(snapshot.data())
    }
    return credential.user
  }, [])

  const logout = useCallback(() => signOut(auth), [])

  const updateProfile = useCallback(
    async (updates) => {
      const activeUser = user || auth.currentUser
      if (!activeUser) return null
      const userRef = doc(db, 'users', activeUser.uid)
      await setDoc(userRef, updates, { merge: true })
      const snapshot = await getDoc(userRef)
      setProfile(snapshot.data())
      return snapshot.data()
    },
    [user]
  )

  const addLanguage = useCallback(
    async (language) => {
      const resolvedLanguage = toLanguageLabel(language)
      if (!resolvedLanguage) return null
      const currentLanguages = profile?.myLanguages || []
      if (currentLanguages.includes(resolvedLanguage)) {
        return updateProfile({ lastUsedLanguage: resolvedLanguage })
      }
      return updateProfile({
        myLanguages: [...currentLanguages, resolvedLanguage],
        lastUsedLanguage: resolvedLanguage,
      })
    },
    [profile?.myLanguages, updateProfile]
  )

  const setLastUsedLanguage = useCallback(
    async (language) => {
      const resolvedLanguage = toLanguageLabel(language)
      if (!resolvedLanguage) return null
      return updateProfile({ lastUsedLanguage: resolvedLanguage })
    },
    [updateProfile]
  )

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      signup,
      login,
      logout,
      addLanguage,
      setLastUsedLanguage,
      updateProfile,
    }),
    [addLanguage, loading, login, logout, profile, setLastUsedLanguage, signup, updateProfile, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export default useAuth
