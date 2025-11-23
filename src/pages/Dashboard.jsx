import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Dashboard = () => {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) {
      navigate('/login')
    }
  }, [navigate, user])

  useEffect(() => {
    if (user && profile && !profile?.myLanguages?.length) {
      navigate('/select-language')
    }
  }, [navigate, profile, user])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="page">
      <div className="card">
        <div className="dashboard__header">
          <div>
            <p className="muted">Logged in as</p>
            <h2>{user?.email}</h2>
          </div>
          <button className="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
        <div className="profile-preview">
          <h3>Your profile</h3>
          {profile?.lastUsedLanguage && (
            <p className="muted">Last used language: {profile.lastUsedLanguage}</p>
          )}
          {profile?.myLanguages?.length ? (
            <div className="pill-row">
              {profile.myLanguages.map((language) => (
                <span
                  key={language}
                  className={`pill ${language === profile.lastUsedLanguage ? 'primary' : ''}`}
                >
                  {language}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">No languages saved yet.</p>
          )}
          <pre>{JSON.stringify(profile || {}, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
