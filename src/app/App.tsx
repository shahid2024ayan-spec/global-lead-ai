import { useEffect, useState } from 'react'
import { LayoutDashboard, Search, Building2, MessagesSquare, Users, BarChart3, Settings, Sun, Moon, Bell, Sparkles, Menu, X, ArrowUpRight, Globe2, ShieldCheck, Zap, CircleHelp, LogOut } from 'lucide-react'

import { useAuth } from '../features/auth/AuthProvider'
import AuthScreen from '../features/auth/AuthScreen'
import { isSupabaseConfigured } from '../lib/supabase'
import { saveSearchSetup } from '../features/search/searchService'
import { loadWorkspaceCounts, type WorkspaceCounts } from '../features/workspace/workspaceService'
import IntegrationSettings from '../features/integrations/IntegrationSettings'
import LiveDiscovery from '../features/integrations/LiveDiscovery'
import SkillIntelligence from '../features/integrations/SkillIntelligence'

type Section = 'Overview' | 'Discover' | 'Businesses' | 'Social opportunities' | 'CRM' | 'Intelligence' | 'Settings'
const navigation: { label: Section; icon: typeof LayoutDashboard; group: string }[] = [
  { label: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { label: 'Discover', icon: Search, group: 'WORKSPACE' },
  { label: 'Businesses', icon: Building2, group: 'PIPELINE' },
  { label: 'Social opportunities', icon: MessagesSquare, group: 'PIPELINE' },
  { label: 'CRM', icon: Users, group: 'PIPELINE' },
  { label: 'Intelligence', icon: BarChart3, group: 'INSIGHTS' },
  { label: 'Settings', icon: Settings, group: 'INSIGHTS' },
]

function App() {
  const [section, setSection] = useState<Section>('Overview')
  const [dark, setDark] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [skill, setSkill] = useState('Web development')
  const [region, setRegion] = useState('Worldwide')
  const [source, setSource] = useState('Both')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [counts, setCounts] = useState<WorkspaceCounts>({ businesses: 0, opportunities: 0, savedLeads: 0 })
  const { user, signOut, loading } = useAuth()

  useEffect(() => {
    if (!user) return
    loadWorkspaceCounts(user.id).then(setCounts).catch(error => console.error('Workspace metrics failed:', error))
  }, [user?.id])

  const startSetup = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    setNotice('')
    try {
      const project = await saveSearchSetup({ userId: user.id, skill, region, source })
      setNotice(`Search setup saved: ${project.name}. Live lead discovery is the next integration module.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save your search setup. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="auth-loading"><span className="loading-spinner"/> Loading your secure workspace…</div>
  if (!isSupabaseConfigured) return <div className="auth-loading"><div><strong>Supabase connection required</strong><p>Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the Vercel environment variables.</p></div></div>
  if (!user) return <AuthScreen />

  return <div className={`app-shell ${dark ? 'theme-dark' : 'theme-light'}`}>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Sparkles size={19}/></div><span>GlobalLead<span className="brand-accent"> AI</span></span><button className="close-menu" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">G</div><div><strong>Global workspace</strong><small>Personal account</small></div><span className="switch-dots">•••</span></div>
      {['WORKSPACE','PIPELINE','INSIGHTS'].map(group => <div className="nav-group" key={group}><p>{group}</p>{navigation.filter(item => item.group === group).map(item => { const Icon = item.icon; return <button key={item.label} className={`nav-link ${section === item.label ? 'active' : ''}`} onClick={() => { setSection(item.label); setMobileOpen(false) }}><Icon size={17}/><span>{item.label}</span>{item.label === 'Discover' && <span className="nav-new">NEW</span>}</button> })}</div>)}
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><strong>Need a hand?</strong><p>Explore the platform roadmap and learn how it works.</p><button onClick={() => setSection('Intelligence')}>Explore guide <ArrowUpRight size={13}/></button></div><div className="profile-row"><div className="profile-avatar">{(user.email?.[0] ?? 'U').toUpperCase()}</div><div className="profile-details"><strong>{user.email ?? 'Your account'}</strong><small>Personal workspace</small></div><button className="icon-button signout-button" onClick={() => signOut().catch(error => setNotice(error.message))} aria-label="Sign out" title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20}/></button><span className="breadcrumb">Workspace <span>/</span> {section}</span></div><div className="topbar-actions"><span className="system-status"><i/> Systems ready</span><button className="icon-button" aria-label="Notifications"><Bell size={18}/></button><button className="icon-button" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="top-avatar account-avatar" onClick={() => signOut().catch(error => setNotice(error.message))} title="Sign out" aria-label="Sign out">{(user.email?.[0] ?? 'U').toUpperCase()}</button></div></header>

      {section === 'Settings' ? <div className="page-content"><div className="subpage"><IntegrationSettings/></div></div> : section === 'Discover' ? <LiveDiscovery/> : section === 'Overview' ? <div className="page-content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> GLOBAL OPPORTUNITY INTELLIGENCE</div><h1>{section === 'Overview' ? <>Find your next<br/><span className="gradient-text">great client.</span></> : <>Discover your next<br/><span className="gradient-text">opportunity.</span></>}</h1><p className="welcome-copy">Turn your skills into a global opportunity pipeline. Find businesses that need you, spot active demand, and build relationships that grow.</p></div><div className="hero-orb"><div className="orb-ring ring-one"/><div className="orb-ring ring-two"/><div className="orb-core"><Globe2 size={38}/></div><span className="orb-tag tag-one">GLOBAL</span><span className="orb-tag tag-two">AI POWERED</span></div></div>

        <section className="search-panel"><div className="panel-heading"><div className="panel-icon"><Search size={19}/></div><div><h2>Build your opportunity search</h2><p>Tell us what you offer and where you want to find demand.</p></div><span className="step-label">01 <span>/ 03</span></span></div>
          <form onSubmit={startSetup}><label className="field"><span>Your skill or service</span><select value={skill} onChange={e => setSkill(e.target.value)}><option>Web development</option><option>AI automation</option><option>SEO</option><option>UI/UX design</option><option>Graphic design</option><option>Digital marketing</option><option>Video editing</option><option>Accounting</option><option>Custom service</option></select></label><label className="field"><span>Target market</span><select value={region} onChange={e => setRegion(e.target.value)}><option>Worldwide</option><option>Pakistan</option><option>United States</option><option>United Kingdom</option><option>United Arab Emirates</option><option>Canada</option><option>Australia</option></select></label><label className="field"><span>Opportunity sources</span><select value={source} onChange={e => setSource(e.target.value)}><option>Both</option><option>Businesses</option><option>Social opportunities</option></select></label><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save search setup'} <ArrowUpRight size={16}/></button></form>
          <div className="panel-foot"><span><ShieldCheck size={14}/> Evidence-first discovery</span><span><Zap size={14}/> AI-assisted matching</span><span><Globe2 size={14}/> Global coverage</span></div>{notice && <div className="inline-notice" role="status">{notice}</div>}
        </section>

        <div className="section-title-row"><div><h2>Your workspace at a glance</h2><p>Live metrics will appear as soon as discovery is connected.</p></div><span className="live-label"><i/> Awaiting first search</span></div>
        <div className="metric-grid">{[{label:'Businesses found',value:String(counts.businesses),hint:'Saved discovery records',icon:Building2},{label:'Social opportunities',value:String(counts.opportunities),hint:'Saved public opportunities',icon:MessagesSquare},{label:'Qualified leads',value:String(counts.savedLeads),hint:'Leads in your CRM',icon:Users},{label:'Pipeline value',value:'0',hint:'No deals recorded yet',icon:BarChart3}].map(metric => {const Icon=metric.icon;return <article className="metric-card" key={metric.label}><div className="metric-top"><span>{metric.label}</span><Icon size={17}/></div><strong>{metric.value}</strong><small>{metric.hint}</small></article>})}</div>
        <div className="bottom-grid"><section className="content-card"><div className="card-title"><div><h3>Opportunity activity</h3><p>Your latest discovery and lead updates</p></div><span className="muted-pill">No activity</span></div><div className="empty-state"><div className="empty-graphic"><Search size={23}/></div><strong>Your next opportunity starts here</strong><p>Run your first search to see verified businesses and public demand signals in this space.</p></div></section><section className="content-card"><div className="card-title"><div><h3>Getting started</h3><p>Your platform setup journey</p></div><span className="progress-count">1 <span>/ 10</span></span></div><div className="progress-track"><span/></div><div className="setup-list"><div className="setup-item done"><span>✓</span><div><strong>Foundation & interface</strong><small>Current module</small></div><b>IN PROGRESS</b></div><div className="setup-item"><span>02</span><div><strong>Database & accounts</strong><small>Secure user workspace</small></div></div><div className="setup-item"><span>03</span><div><strong>Data integrations</strong><small>Connect trusted sources</small></div></div></div></section></div>
        <footer className="page-footer"><span>GLOBALLEAD AI <b>•</b> BUILDING THE FUTURE OF CLIENT DISCOVERY</span><span>Module 01 · Foundation</span></footer>
      </div> : section === 'Intelligence' ? <SkillIntelligence/> : <div className="page-content"><div className="subpage"><div className="eyebrow">GLOBALLEAD AI WORKSPACE</div><h1>{section}</h1><p>This area is reserved for Module {section === 'Businesses' ? '05' : section === 'Social opportunities' ? '06' : section === 'CRM' ? '09' : '08'} of the roadmap. It will be activated when its real data and workflows are implemented.</p><div className="coming-card"><div className="panel-icon"><Sparkles size={20}/></div><h2>Built in sequence. No fake data.</h2><p>We are completing each module with its own components, services, tests, and audit before moving forward.</p><button className="secondary-button" onClick={() => setSection('Overview')}>Back to overview</button></div></div></div>}
    </main>
  </div>
}

export default App