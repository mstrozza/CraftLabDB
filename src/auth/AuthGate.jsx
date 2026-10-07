import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';

function ProviderIcon({ provider }) {
  if (provider === 'google') return <span className="provider-google" aria-hidden="true">G</span>;
  return <span className="provider-microsoft" aria-hidden="true"><i /><i /><i /><i /></span>;
}

function AuthBrandPanel() {
  return <section className="auth-brand-panel" aria-label="DB DocGen">
    <div className="auth-brand"><span className="auth-brand-mark"><i /></span><span>Deutsche Bank</span></div>
    <div className="auth-brand-copy"><span className="auth-eyebrow">DOCUMENTACIÓN TÉCNICA</span><h1>DB DocGen</h1><p>Crea, estructura y exporta especificaciones de evolutivos COBOL desde un único espacio de trabajo.</p></div>
    <div className="auth-security-note"><ShieldCheck size={18} /><span>Acceso protegido y preparado para identidad corporativa</span></div>
  </section>;
}

function PasswordControl({ id, value, onChange, autoComplete, placeholder, disabled }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-email-control auth-password-control">
    <KeyRound size={16} aria-hidden="true" />
    <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} disabled={disabled} required />
    <button type="button" className="auth-password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} disabled={disabled}>
      {visible ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  </div>;
}

function LoginScreen({ passwordFlow = null }) {
  const { configured, error: authError, clearAuthError, signInDemo, requestAccess, signInWithPassword, signInWithProvider, sendPasswordRecovery, setPassword } = useAuth();
  const [mode, setMode] = useState(passwordFlow === 'setup' ? 'set-password' : passwordFlow === 'recovery' ? 'reset-password' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPasswordInput] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState('');
  const [formError, setFormError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (passwordFlow === 'setup') setMode('set-password');
    if (passwordFlow === 'recovery') setMode('reset-password');
  }, [passwordFlow]);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    clearAuthError();
    setFormError('');
    setEmailSent(false);
    setPasswordInput('');
    setConfirmPassword('');
  };

  const runProviderLogin = async (provider) => {
    setSubmitting(provider);
    setFormError('');
    try { await signInWithProvider(provider); }
    catch { setFormError('No se ha podido iniciar sesión con este proveedor. Inténtalo de nuevo.'); setSubmitting(''); }
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setSubmitting('login');
    setFormError('');
    try { await signInWithPassword(email, password); }
    catch { setFormError('No hemos podido iniciar sesión. Comprueba tus datos o recupera la contraseña.'); }
    finally { setSubmitting(''); }
  };

  const submitEmailRequest = async (event) => {
    event.preventDefault();
    setSubmitting('email');
    setFormError('');
    setEmailSent(false);
    try {
      if (mode === 'first-access') await requestAccess(email);
      else await sendPasswordRecovery(email);
      setEmailSent(true);
    } catch {
      setFormError(mode === 'first-access'
        ? 'No se ha podido registrar la solicitud. Inténtalo de nuevo más tarde.'
        : 'No se ha podido enviar el enlace. Inténtalo de nuevo más tarde.');
    }
    finally { setSubmitting(''); }
  };

  const submitNewPassword = async (event) => {
    event.preventDefault();
    if (password.length < 8) { setFormError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setFormError('Las contraseñas no coinciden.'); return; }
    setSubmitting('password');
    setFormError('');
    try {
      await setPassword(password);
      setPasswordInput('');
      setConfirmPassword('');
    } catch { setFormError('No se ha podido guardar la contraseña. Inténtalo de nuevo.'); }
    finally { setSubmitting(''); }
  };

  const submitDemo = (event) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) { setFormError('Indica tu nombre y correo para continuar.'); return; }
    setSubmitting('demo');
    setFormError('');
    try { signInDemo({ name, email }); }
    catch { setFormError('No se ha podido iniciar la sesión de prueba.'); setSubmitting(''); }
  };

  const isPasswordForm = mode === 'set-password' || mode === 'reset-password';
  const isEmailRequest = mode === 'first-access' || mode === 'forgot-password';
  const title = isPasswordForm ? (mode === 'set-password' ? 'Crea tu contraseña' : 'Nueva contraseña') : isEmailRequest ? (mode === 'first-access' ? 'Solicitar acceso' : 'Recuperar contraseña') : 'Iniciar sesión';
  const intro = isPasswordForm ? (mode === 'set-password' ? 'Crea una contraseña para acceder con tu correo la próxima vez.' : 'Establece una contraseña nueva para tu cuenta.') : isEmailRequest ? (mode === 'first-access' ? 'Indica tu correo para solicitar acceso. Un administrador revisará la petición.' : 'Te enviaremos un enlace para cambiar tu contraseña.') : 'Identifícate para acceder a tus documentos técnicos.';

  return <main className="auth-shell">
    <AuthBrandPanel />

    <section className="auth-form-panel"><div className="auth-card">
      {isEmailRequest && <button type="button" className="auth-back-button" onClick={() => changeMode('login')}><ArrowLeft size={15} /> Volver</button>}
      <div className="auth-card-icon"><LockKeyhole size={22} /></div>
      <span className="auth-card-kicker">ACCESO A LA APLICACIÓN</span>
      <h2>{title}</h2><p className="auth-intro">{intro}</p>

      {configured && mode === 'login' && <div className="auth-provider-list">
        <button type="button" className="auth-provider-button" onClick={() => runProviderLogin('google')} disabled={Boolean(submitting)}>
          <ProviderIcon provider="google" /><span>Continuar con Google</span>{submitting === 'google' ? <LoaderCircle className="auth-spinner" size={17} /> : <ArrowRight size={17} />}
        </button>
        <button type="button" className="auth-provider-button auth-provider-unavailable" disabled aria-describedby="microsoft-pending-note"><ProviderIcon provider="microsoft" /><span>Continuar con Microsoft</span><small>Próximamente</small></button>
        <div className="auth-divider"><span>o accede por correo</span></div>
        <form className="auth-email-form" onSubmit={submitLogin}>
          <label htmlFor="auth-email">Correo electrónico</label>
          <div className="auth-email-control"><Mail size={16} aria-hidden="true" /><input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="nombre@empresa.com" disabled={Boolean(submitting)} required /></div>
          <label htmlFor="auth-login-password">Contraseña</label>
          <PasswordControl id="auth-login-password" value={password} onChange={(event) => setPasswordInput(event.target.value)} autoComplete="current-password" placeholder="Tu contraseña" disabled={Boolean(submitting)} />
          <button type="button" className="auth-inline-link auth-forgot-link" onClick={() => changeMode('forgot-password')}>¿Olvidaste la contraseña?</button>
          <button type="submit" className="auth-submit-button" disabled={Boolean(submitting)}>{submitting === 'login' ? <LoaderCircle className="auth-spinner" size={17} /> : <LockKeyhole size={17} />}Iniciar sesión</button>
        </form>
        <div className="auth-first-access"><span>¿Es tu primera vez?</span><button type="button" className="auth-inline-link" onClick={() => changeMode('first-access')}>Solicitar acceso</button></div>
        <p id="microsoft-pending-note" className="sr-only">El acceso con Microsoft estará disponible próximamente.</p>
      </div>}

      {configured && isEmailRequest && <form className="auth-email-form" onSubmit={submitEmailRequest}>
        <label htmlFor="auth-request-email">Correo electrónico</label>
        <div className="auth-email-control"><Mail size={16} aria-hidden="true" /><input id="auth-request-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailSent(false); }} autoComplete="email" placeholder="nombre@empresa.com" disabled={Boolean(submitting)} required /></div>
        <button type="submit" className="auth-submit-button" disabled={Boolean(submitting)}>{submitting === 'email' ? <LoaderCircle className="auth-spinner" size={17} /> : <Mail size={17} />}{mode === 'first-access' ? 'Solicitar acceso' : 'Enviar enlace de recuperación'}</button>
        {emailSent && <div className="auth-success" role="status">{mode === 'first-access' ? 'Solicitud recibida. Si corresponde, recibirás instrucciones por correo tras la revisión.' : 'Si el correo puede recibir un enlace, lo encontrarás en tu bandeja de entrada.'}</div>}
      </form>}

      {configured && isPasswordForm && <form className="auth-email-form" onSubmit={submitNewPassword}>
        <label htmlFor="auth-new-password">Nueva contraseña</label>
        <PasswordControl id="auth-new-password" value={password} onChange={(event) => setPasswordInput(event.target.value)} autoComplete="new-password" placeholder="Nueva contraseña" disabled={Boolean(submitting)} />
        <label htmlFor="auth-confirm-password">Confirmar contraseña</label>
        <PasswordControl id="auth-confirm-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Repite la contraseña" disabled={Boolean(submitting)} />
        <p className="auth-password-hint">Mínimo 8 caracteres</p>
        <button type="submit" className="auth-submit-button" disabled={Boolean(submitting)}>{submitting === 'password' ? <LoaderCircle className="auth-spinner" size={17} /> : <LockKeyhole size={17} />}{mode === 'set-password' ? 'Guardar contraseña y entrar' : 'Guardar nueva contraseña'}</button>
      </form>}

      {!configured && <form className="auth-demo-form" onSubmit={submitDemo}>
        <div className="auth-demo-heading"><strong>Modo local de prueba</strong><span>Sin conexión a un proveedor de identidad</span></div>
        <label><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Tu nombre y apellidos" autoFocus /></label>
        <label><span>Correo electrónico</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nombre@empresa.com" /></label>
        <button type="submit" className="auth-submit-button" disabled={submitting === 'demo'}>{submitting === 'demo' ? <LoaderCircle className="auth-spinner" size={17} /> : <LockKeyhole size={17} />}Entrar en modo de prueba</button>
        <p className="auth-demo-disclaimer">Esta sesión sólo se guarda en este navegador y no sustituye una autenticación de producción.</p>
      </form>}

      {(formError || authError) && <div className="auth-error" role="alert">{formError || 'No se ha podido completar el acceso. Inténtalo de nuevo.'}</div>}
      {!configured && <div className="auth-provider-pending"><ProviderIcon provider="google" /><ProviderIcon provider="microsoft" /><span>Google y el acceso por correo se habilitarán al conectar Supabase.</span></div>}
    </div><p className="auth-footer">DB DocGen · Evolutivos COBOL</p></section>
  </main>;
}

function PendingAccessScreen({ knownInactive = false, previouslyActive = false }) {
  const { user, requestAccess, requestReactivation, refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState('');

  const run = async (action) => {
    setBusy(action);
    setMessage(null);
    setError('');
    try {
      if (action === 'request') {
        if (!knownInactive) return;
        if (previouslyActive) {
          await requestReactivation();
          setMessage({ tone: 'success', text: 'Solicitud de reactivación recibida. Un administrador revisará tu acceso; no necesitas esperar un correo.' });
        } else {
          await requestAccess(user.email);
          setMessage({ tone: 'success', text: 'Solicitud de alta recibida. Si corresponde, recibirás instrucciones por correo tras la revisión.' });
        }
      } else if (action === 'refresh') {
        await refreshProfile();
        setMessage({ tone: 'warning', text: 'Tu acceso sigue pendiente de aprobación.' });
      } else {
        await signOut();
      }
    } catch (requestError) {
      setError(requestError?.message === 'registration_processing'
        ? 'Tu alta inicial sigue en proceso. Comprueba el estado más tarde; todavía no se ha registrado una reactivación.'
        : 'No se ha podido completar la acción. Inténtalo de nuevo.');
    } finally {
      setBusy('');
    }
  };

  return <main className="auth-shell">
    <AuthBrandPanel />
    <section className="auth-form-panel"><div className="auth-card auth-pending-card">
      <div className="auth-card-icon"><ShieldCheck size={22} /></div>
      <span className="auth-card-kicker">ACCESO A LA APLICACIÓN</span>
      <h2>{knownInactive ? previouslyActive ? 'Cuenta desactivada' : 'Acceso pendiente' : 'No se pudo comprobar el acceso'}</h2>
      <p className="auth-intro">{knownInactive
        ? previouslyActive ? 'Puedes solicitar la reactivación de esta cuenta. Un administrador la revisará sin enviar una nueva invitación.' : 'Tu cuenta todavía no ha sido activada. Solicita el alta para que un administrador la revise y te envíe el enlace inicial.'
        : 'Comprueba de nuevo el estado de tu cuenta. No puedes enviar una solicitud hasta verificar el perfil.'}</p>
      <p className="auth-pending-email">{user?.email}</p>
      <div className="auth-pending-actions">
        {knownInactive && <button type="button" className="auth-submit-button" disabled={Boolean(busy) || !user?.email} onClick={() => run('request')}>{previouslyActive ? 'Solicitar reactivación' : 'Solicitar acceso'}</button>}
        <button type="button" className="auth-secondary-button" disabled={Boolean(busy)} onClick={() => run('refresh')}>Comprobar acceso</button>
        <button type="button" className="auth-inline-link" disabled={Boolean(busy)} onClick={() => run('signout')}>Cerrar sesión</button>
      </div>
      {message && <div className={message.tone === 'warning' ? 'auth-warning' : 'auth-success'} role="status">{message.text}</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
    </div><p className="auth-footer">DB DocGen · Evolutivos COBOL</p></section>
  </main>;
}

export function AuthGate({ children }) {
  const { configured, status, isAuthenticated, passwordFlow, profileStatus, profile, user } = useAuth();
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem('db-docgen-theme') === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = savedTheme;
      document.documentElement.style.colorScheme = savedTheme;
    } catch { document.documentElement.dataset.theme = 'light'; }
  }, []);
  if (status === 'loading') return <div className="auth-loading"><LoaderCircle className="auth-spinner" size={28} /><span>Comprobando sesión…</span></div>;
  if (!isAuthenticated) return <LoginScreen key="login" />;
  if (configured && passwordFlow) return <LoginScreen key={passwordFlow} passwordFlow={passwordFlow} />;
  const matchingProfile = profile?.id === user?.id;
  if (configured && (!matchingProfile && profileStatus === 'loading')) return <div className="auth-loading"><LoaderCircle className="auth-spinner" size={28} /><span>Comprobando permisos…</span></div>;
  if (configured && (!matchingProfile || !profile?.is_active)) {
    return <PendingAccessScreen
      knownInactive={profileStatus === 'ready' && matchingProfile && profile.is_active === false}
      previouslyActive={profile?.has_ever_been_active === true}
    />;
  }
  return children;
}
