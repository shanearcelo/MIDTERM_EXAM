import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ohhhnwvoembvsotlflpi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5xlkFtlCKc_PqmS74CRBag_Eh1Ahp1t';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let currentUser = null;
let currentProfile = null;
let submissionsCache = [];

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  const authForm = document.getElementById('auth-form');
  if (authForm) authForm.addEventListener('submit', window.handleLogin);

  document.getElementById('submission-form')?.addEventListener('submit', handleScholarSubmit);
  document.getElementById('staff-search')?.addEventListener('input', filterStaffTable);
  document.getElementById('staff-filter-status')?.addEventListener('change', filterStaffTable);

  checkSession();
});

// 2. AUTHENTICATION & NAVIGATION HANDLER
window.handleLogin = async function(e) {
  if (e) e.preventDefault();
  
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');

  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert("Login Error: " + error.message);
    } else {
      await checkSession();
    }
  } catch (err) {
    alert("Unexpected System Error: " + err.message);
  }
};

// Global Log Out Handler
window.handleLogout = async function() {
  const confirmLogout = confirm("Are you sure you want to log out?");
  if (!confirmLogout) return;

  console.log("Signing out user session...");
  
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      alert("Error logging out: " + error.message);
      console.error("Sign-out error:", error);
    } else {
      currentUser = null;
      currentProfile = null;
      alert("Successfully logged out!");
      
      // I-reset ang UI: Ipakita ang Auth Screen ug I-hide ang Dashboard
      const authScreen = document.getElementById('auth-screen');
      const appContainer = document.getElementById('app-container');

      if (authScreen) {
        authScreen.classList.remove('hidden');
        authScreen.style.display = 'grid'; // Re-enable grid display
      }
      if (appContainer) {
        appContainer.classList.add('hidden');
        appContainer.style.display = 'none'; // Hard hide app container
      }

      // I-clear ang login form inputs
      const emailInput = document.getElementById('auth-email') || document.getElementById('login-email');
      const passwordInput = document.getElementById('auth-password') || document.getElementById('login-password');
      if (emailInput) emailInput.value = '';
      if (passwordInput) passwordInput.value = '';
    }
  } catch (err) {
    console.error("Unexpected logout error:", err);
    alert("Unexpected Error during logout: " + err.message);
  }
};


async function checkSession() {
  const authScreen = document.getElementById('auth-screen');
  const appContainer = document.getElementById('app-container');

  try {
    const { data: { user }, error: authError } =
      await supabase.auth.getUser();

    if (authError) {
      console.error('Auth error:', authError);
      throw authError;
    }

    if (!user) {
      currentUser = null;
      currentProfile = null;

      authScreen?.classList.remove('hidden');
      appContainer?.classList.add('hidden');
      return;
    }

    currentUser = user;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile query error:', profileError);
      alert('Unable to load your profile: ' + profileError.message);
      return;
    }

    if (!profile) {
      console.error('No profile found for user:', user.id);
      alert(
        'Login successful, but no profile was found. ' +
        'Check if public.profiles has a record with id = ' + user.id
      );
      return;
    }

    if (!['scholar', 'staff'].includes(profile.role)) {
      console.error('Invalid user role:', profile.role);
      alert('Invalid account role. Please check the profiles table.');
      return;
    }

    currentProfile = profile;

    document.getElementById('user-name-display').textContent =
      profile.full_name || 'User';

    document.getElementById('user-role-display').textContent =
      profile.role.toUpperCase();

    document.getElementById('user-avatar').textContent =
      (profile.full_name || 'U').charAt(0).toUpperCase();

    authScreen?.classList.add('hidden');
    appContainer?.classList.remove('hidden');

    if (profile.role === 'scholar') {
      document.getElementById('nav-staff')?.style.setProperty('display', 'none');
      document.getElementById('nav-scholar')?.style.setProperty('display', 'flex');

      window.switchView('scholar');
      await loadScholarDashboard();
    } else {
      document.getElementById('nav-scholar')?.style.setProperty('display', 'none');
      document.getElementById('nav-staff')?.style.setProperty('display', 'flex');

      window.switchView('staff');
      await loadStaffDashboard();
    }

  } catch (err) {
    console.error('Session check failed:', err);
    alert('Unable to open dashboard: ' + err.message);
  }
}


// 3. SCHOLAR MODULE
async function handleScholarSubmit(e) {
  e.preventDefault();

  const periodParts = document.getElementById('sub-period').value.split('|');
  const ay = periodParts[0];
  const semester = parseInt(periodParts[1]);
  const gwa = parseFloat(document.getElementById('sub-gwa').value);
  const units = parseInt(document.getElementById('sub-units').value);
  const failed = parseInt(document.getElementById('sub-failed').value);
  const inc = parseInt(document.getElementById('sub-inc').value);
  const dropped = parseInt(document.getElementById('sub-dropped').value);
  const evidenceUrl = document.getElementById('sub-evidence').value;

  if (isNaN(gwa) || gwa < 1.00 || gwa > 5.00) return alert("Invalid GWA. Must be 1.00-5.00.");
  if (units < 0 || failed < 0 || inc < 0 || dropped < 0) return alert("Counts must be non-negative integers.");

  const { error } = await supabase.from('semester_submissions').upsert({
    scholar_id: currentUser.id,
    academic_year: ay,
    semester: semester,
    gwa,
    enrolled_units: units,
    failed_count: failed,
    inc_count: inc,
    dropped_count: dropped,
    evidence_url: evidenceUrl,
    submitted_at: new Date().toISOString(),
    verification_status: 'Pending verification'
  }, { onConflict: 'scholar_id,academic_year,semester' });

  if (error) {
    alert("Error saving submission: " + error.message);
  } else {
    alert("Academic summary submitted successfully!");
    await loadScholarDashboard();
  }
}

async function loadScholarDashboard() {
  const { data: submissions, error } = await supabase
    .from('semester_submissions')
    .select('*')
    .eq('scholar_id', currentUser.id)
    .order('submitted_at', { ascending: false });

  if (error) return;

  const tbody = document.getElementById('scholar-history-tbody');
  if (!tbody) return;

  tbody.innerHTML = (submissions || []).map(s => `
    <tr>
      <td><b>AY ${s.academic_year}</b><br>Semester ${s.semester}</td>
      <td>GWA: <b>${s.gwa}</b> | Units: ${s.enrolled_units}<br><small style="color:var(--text-muted)">F:${s.failed_count} INC:${s.inc_count} D:${s.dropped_count}</small></td>
      <td><span class="status-pill status-${s.verification_status.toLowerCase().replace(/\s+/g, '-')}">${s.verification_status}</span></td>
      <td><span class="status-pill status-${s.compliance_status.toLowerCase().replace(/\s+/g, '-')}">${s.compliance_status}</span></td>
      <td><span class="status-pill status-${s.renewal_decision.toLowerCase()}">${s.renewal_decision}</span></td>
      <td><a href="${s.evidence_url}" target="_blank" style="color:var(--primary); font-weight:600;">View Link</a></td>
    </tr>
  `).join('');

  if (window.lucide) window.lucide.createIcons();
}

// 4. STAFF MODULE
async function loadStaffDashboard() {
  const { data: submissions, error } = await supabase
    .from('semester_submissions')
    .select(`
      *,
      profiles:scholar_id(student_id, full_name),
      scholar_assignments(scholarship_policies(*))
    `);

  if (error) return;

  submissionsCache = submissions || [];
  renderMetrics();
  renderStaffTable(submissionsCache);
}

function renderMetrics() {
  const mTotal = document.getElementById('m-total');
  const mPending = document.getElementById('m-pending');
  const mCompliant = document.getElementById('m-compliant');
  const mDeficient = document.getElementById('m-deficient');

  if (mTotal) mTotal.textContent = submissionsCache.length;
  if (mPending) mPending.textContent = submissionsCache.filter(s => s.verification_status === 'Pending verification').length;
  if (mCompliant) mCompliant.textContent = submissionsCache.filter(s => s.compliance_status === 'Compliant').length;
  if (mDeficient) mDeficient.textContent = submissionsCache.filter(s => s.compliance_status === 'With Deficiency').length;
}

function renderStaffTable(data) {
  const tbody = document.getElementById('staff-tbody');
  if (!tbody) return;

  tbody.innerHTML = data.map(s => {
    const policy = s.scholar_assignments?.[0]?.scholarship_policies;
    const defs = s.deficiency_reasons || [];

    return `
      <tr>
        <td><b>${s.profiles ? s.profiles.full_name : 'Unknown Scholar'}</b><br><small style="color:var(--text-muted)">ID: ${s.profiles ? s.profiles.student_id : 'N/A'}</small></td>
        <td><b>${policy ? policy.program_name : 'Unassigned'}</b></td>
        <td>GWA: <b>${s.gwa}</b> | Units: ${s.enrolled_units}<br><small style="color:var(--text-muted)">F:${s.failed_count} INC:${s.inc_count} D:${s.dropped_count}</small></td>
        <td>
          <span class="status-pill status-${s.verification_status.toLowerCase().replace(/\s+/g, '-')}">${s.verification_status}</span><br>
          <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem; margin-top:6px;" onclick="window.verifySubmission('${s.id}')">Verify</button>
        </td>
        <td>
          <span class="status-pill status-${s.compliance_status.toLowerCase().replace(/\s+/g, '-')}">${s.compliance_status}</span>
          ${defs.length ? `<div style="font-size:0.75rem; color:var(--danger); margin-top:4px;">${defs.join(', ')}</div>` : ''}<br>
          <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem; margin-top:6px;" onclick="window.runComplianceCheck('${s.id}')">Evaluate</button>
        </td>
        <td>
          <span class="status-pill status-${s.renewal_decision.toLowerCase()}">${s.renewal_decision}</span><br>
          <select onchange="window.setDecision('${s.id}', this.value)" style="padding:2px 6px; font-size:0.75rem; margin-top:6px;" ${s.compliance_status !== 'Compliant' ? 'disabled' : ''}>
            <option value="Pending" ${s.renewal_decision==='Pending'?'selected':''}>Pending</option>
            <option value="Approved" ${s.renewal_decision==='Approved'?'selected':''}>Approve</option>
            <option value="Held" ${s.renewal_decision==='Held'?'selected':''}>Hold</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// Staff Actions
window.verifySubmission = async (id) => {
  const sub = submissionsCache.find(s => s.id === id);
  const status = prompt("Set verification status ('Verified' or 'Returned'):", sub?.verification_status || 'Verified');
  if (!['Verified', 'Returned'].includes(status)) return;

  const reason = prompt("Enter verification reason / notes:", sub?.verification_reason || "");

  const { error } = await supabase.from('semester_submissions')
    .update({ verification_status: status, verification_reason: reason })
    .eq('id', id);

  if (!error) {
    await logAuditHistory(id, `VERIFICATION_${status.toUpperCase()}`, `Notes: ${reason}`);
    await loadStaffDashboard();
  }
};

window.runComplianceCheck = async (id) => {
  const sub = submissionsCache.find(s => s.id === id);
  const policy = sub?.scholar_assignments?.[0]?.scholarship_policies;

  if (!policy) return alert("Scholar has no assigned scholarship policy threshold.");
  if (sub.verification_status !== 'Verified') return alert("Verification is required prior to compliance evaluation.");

  const defs = [];
  if (parseFloat(sub.gwa) > parseFloat(policy.max_gwa)) defs.push(`GWA ${sub.gwa} exceeds limit of ${policy.max_gwa}`);
  if (parseInt(sub.enrolled_units) < parseInt(policy.min_units)) defs.push(`Units (${sub.enrolled_units}) below minimum (${policy.min_units})`);
  if (parseInt(sub.failed_count) > parseInt(policy.max_failed)) defs.push(`Failed courses (${sub.failed_count}) exceed limit (${policy.max_failed})`);
  if (parseInt(sub.inc_count) > parseInt(policy.max_inc)) defs.push(`Incomplete grades (${sub.inc_count}) exceed limit (${policy.max_inc})`);
  if (parseInt(sub.dropped_count) > parseInt(policy.max_dropped)) defs.push(`Dropped courses (${sub.dropped_count}) exceed limit (${policy.max_dropped})`);

  if (policy.deadline_at && new Date(sub.submitted_at).getTime() > new Date(policy.deadline_at).getTime()) {
    defs.push(`Late submission`);
  }

  const status = defs.length === 0 ? 'Compliant' : 'With Deficiency';

  const { error } = await supabase.from('semester_submissions').update({
    compliance_status: status,
    deficiency_reasons: defs
  }).eq('id', id);

  if (!error) {
    await logAuditHistory(id, `EVALUATION`, `Evaluated as ${status}.`);
    await loadStaffDashboard();
  }
};

window.setDecision = async (id, decision) => {
  const sub = submissionsCache.find(s => s.id === id);
  if (decision === 'Approved' && sub.compliance_status !== 'Compliant') {
    alert("Cannot approve renewal for a deficient record.");
    await loadStaffDashboard();
    return;
  }

  const notes = prompt("Enter decision notes:", sub?.decision_notes || "");

  const { error } = await supabase.from('semester_submissions')
    .update({ renewal_decision: decision, decision_notes: notes })
    .eq('id', id);

  if (!error) {
    await logAuditHistory(id, `RENEWAL_${decision.toUpperCase()}`, `Notes: ${notes}`);
    await loadStaffDashboard();
  }
};

async function logAuditHistory(submissionId, action, notes) {
  await supabase.from('evaluation_history').insert({
    submission_id: submissionId,
    performed_by: currentUser.id,
    action: action,
    notes: notes
  });
}

function filterStaffTable() {
  const query = (document.getElementById('staff-search')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('staff-filter-status')?.value || 'ALL';

  const filtered = submissionsCache.filter(s => {
    const matchQuery = (s.profiles?.full_name.toLowerCase() || '').includes(query) || (s.profiles?.student_id.toLowerCase() || '').includes(query);
    const matchStatus = statusFilter === 'ALL' || s.compliance_status === statusFilter;
    return matchQuery && matchStatus;
  });

  renderStaffTable(filtered);
}

window.switchView = (view) => {
  const viewScholar = document.getElementById('view-scholar');
  const viewStaff = document.getElementById('view-staff');
  const navScholar = document.getElementById('nav-scholar');
  const navStaff = document.getElementById('nav-staff');

  viewScholar?.classList.add('hidden');
  viewStaff?.classList.add('hidden');
  navScholar?.classList.remove('active');
  navStaff?.classList.remove('active');

  if (view === 'scholar') {
    viewScholar?.classList.remove('hidden');
    navScholar?.classList.add('active');
  } else {
    viewStaff?.classList.remove('hidden');
    navStaff?.classList.add('active');
  }
};