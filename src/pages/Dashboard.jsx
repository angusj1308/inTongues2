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
          <pre>{JSON.stringify(profile || {}, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
