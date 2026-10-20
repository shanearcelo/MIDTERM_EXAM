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
  const confirmLogout = confirm("Are you sure you want logout?");
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


async function loadStaffDashboard() {
  console.log('Loading staff dashboard...');

  // Step 1: Load all accessible submissions
  const { data: submissions, error } = await supabase
    .from('semester_submissions')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error('Failed to load submissions:', error);
    alert('Unable to load submissions: ' + error.message);
    return;
  }

  submissionsCache = submissions || [];

  // Step 2: Load scholar profiles separately
  const scholarIds = [
    ...new Set(submissionsCache.map(s => s.scholar_id).filter(Boolean))
  ];

  if (scholarIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, student_id, full_name')
      .in('id', scholarIds);

    if (profileError) {
      console.error('Failed to load scholar profiles:', profileError);
    } else {
      const profileMap = new Map(
        (profiles || []).map(p => [p.id, p])
      );

      submissionsCache = submissionsCache.map(s => ({
        ...s,
        profiles: profileMap.get(s.scholar_id) || null
      }));
    }

    // Step 3: Load scholarship assignments separately
    const { data: assignments, error: assignmentError } = await supabase
      .from('scholar_assignments')
      .select('*, scholarship_policies(*)')
      .in('scholar_id', scholarIds);

    if (assignmentError) {
      console.error('Failed to load scholarship assignments:', assignmentError);
    } else {
      const assignmentMap = new Map();

      (assignments || []).forEach(a => {
        if (!assignmentMap.has(a.scholar_id)) {
          assignmentMap.set(a.scholar_id, []);
        }
        assignmentMap.get(a.scholar_id).push(a);
      });

      submissionsCache = submissionsCache.map(s => ({
        ...s,
        scholar_assignments: assignmentMap.get(s.scholar_id) || []
      }));
    }
  }

  console.log('Total submissions:', submissionsCache.length);
  console.log('Staff submission data:', submissionsCache);

  renderMetrics();
  renderStaffTable(submissionsCache);
}



function renderMetrics() {
  const mTotal = document.getElementById('m-total');
  const mPending = document.getElementById('m-pending');
  const mCompliant = document.getElementById('m-compliant');
  const mDeficient = document.getElementById('m-deficient');

  if (mTotal) {
    mTotal.textContent = submissionsCache.length;
  }

  if (mPending) {
    mPending.textContent = submissionsCache.filter(
      s => s.verification_status === 'Pending verification'
    ).length;
  }

  if (mCompliant) {
    mCompliant.textContent = submissionsCache.filter(
      s => s.compliance_status === 'Compliant'
    ).length;
  }

  if (mDeficient) {
    mDeficient.textContent = submissionsCache.filter(
      s => s.compliance_status === 'With Deficiency'
    ).length;
  }
}



function renderStaffTable(data) {
  const tbody = document.getElementById('staff-tbody');
  if (!tbody) {
    console.error('Element #staff-tbody was not found in index.html');
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:20px;">
          No scholar submissions found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.map(s => {
    const profile = s.profiles;
    const assignment = s.scholar_assignments?.[0];
    const policy = assignment?.scholarship_policies;
    const policyData = Array.isArray(policy) ? policy[0] : policy;

    const name = profile?.full_name || 'Unknown Scholar';
    const studentId = profile?.student_id || 'N/A';
    const program = policyData?.program_name || 'Unassigned';

    const verification = s.verification_status || 'Pending verification';
    const compliance = s.compliance_status || 'Not Evaluated';
    const decision = s.renewal_decision || 'Pending';
    const defs = Array.isArray(s.deficiency_reasons)
      ? s.deficiency_reasons
      : [];

    const verificationClass = verification.toLowerCase().replace(/\s+/g, '-');
    const complianceClass = compliance.toLowerCase().replace(/\s+/g, '-');
    const decisionClass = decision.toLowerCase();

    return `
      <tr>
        <td>
          <b>${name}</b><br>
          <small style="color:var(--text-muted)">ID: ${studentId}</small>
        </td>

        <td><b>${program}</b></td>

        <td>
          GWA: <b>${s.gwa ?? 'N/A'}</b> |
          Units: ${s.enrolled_units ?? 'N/A'}<br>
          <small style="color:var(--text-muted)">
            F:${s.failed_count ?? 0}
            INC:${s.inc_count ?? 0}
            D:${s.dropped_count ?? 0}
          </small>
        </td>

        
<td>
  <div style="margin-bottom:8px;">
    <strong>Evidence File:</strong><br>
    ${
      s.evidence_url
        ? `<a href="${s.evidence_url}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-secondary"
              style="display:inline-block;margin-top:6px;padding:6px 10px;">
              View Submitted File
           </a>`
        : '<span style="color:var(--danger);">No evidence submitted</span>'
    }
  </div>

  <div style="margin-bottom:8px;">
    <span class="status-pill status-${(s.verification_status || 'Pending verification').toLowerCase().replace(/\s+/g, '-')}">
      ${s.verification_status || 'Pending verification'}
    </span>
  </div>

  <button
    class="btn btn-primary"
    style="padding:6px 10px;margin-right:4px;"
    onclick="window.verifySubmission('${s.id}', 'Verified')">
    Verified
  </button>

  <button
    class="btn btn-secondary"
    style="padding:6px 10px;"
    onclick="window.verifySubmission('${s.id}', 'Returned')">
    Returned
  </button>
</td>


        <td>
          <span class="status-pill status-${complianceClass}">
            ${compliance}
          </span>

          ${defs.length
            ? `<div style="font-size:0.75rem;color:var(--danger);margin-top:4px;">
                ${defs.join(', ')}
              </div>`
            : ''
          }

          <br>
          <button class="btn btn-secondary"
            style="padding:2px 8px; font-size:0.75rem; margin-top:6px;"
            onclick="window.runComplianceCheck('${s.id}')">
            Evaluate
          </button>
        </td>

        <td>
          <span class="status-pill status-${decisionClass}">
            ${decision}
          </span><br>

          <select
            onchange="window.setDecision('${s.id}', this.value)"
            style="padding:2px 6px;font-size:0.75rem;margin-top:6px;"
            ${compliance !== 'Compliant' ? 'disabled' : ''}>

            <option value="Pending" ${decision === 'Pending' ? 'selected' : ''}>
              Pending
            </option>
            <option value="Approved" ${decision === 'Approved' ? 'selected' : ''}>
              Approve
            </option>
            <option value="Held" ${decision === 'Held' ? 'selected' : ''}>
              Hold
            </option>
          </select>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}


// Staff Actions

window.verifySubmission = async (id, status) => {
  if (!['Verified', 'Returned'].includes(status)) {
    alert('Invalid verification status.');
    return;
  }

  const sub = submissionsCache.find(s => s.id === id);

  if (!sub) {
    alert('Submission record not found.');
    return;
  }

  if (!sub.evidence_url) {
    alert('No evidence file was submitted. Please check the submission first.');
    return;
  }

  const confirmAction = confirm(
    `Are you sure you want to mark this submission as ${status}?`
  );

  if (!confirmAction) return;

  const { error } = await supabase
    .from('semester_submissions')
    .update({
      verification_status: status
    })
    .eq('id', id);

  if (error) {
    console.error('Verification update error:', error);
    alert('Failed to update verification: ' + error.message);
    return;
  }

  const { error: auditError } = await supabase
    .from('evaluation_history')
    .insert({
      submission_id: id,
      performed_by: currentUser.id,
      action: `VERIFICATION_${status.toUpperCase()}`,
      notes: `Evidence marked as ${status}.`
    });

  if (auditError) {
    console.error('Audit history error:', auditError);
  }

  alert(`Submission marked as ${status}.`);
  await loadStaffDashboard();
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
  const query = (
    document.getElementById('staff-search')?.value || ''
  ).toLowerCase().trim();

  const statusFilter =
    document.getElementById('staff-filter-status')?.value || 'ALL';

  const filtered = submissionsCache.filter(s => {
    const name = (s.profiles?.full_name || '').toLowerCase();
    const studentId = (s.profiles?.student_id || '').toLowerCase();

    const matchQuery =
      name.includes(query) || studentId.includes(query);

    const matchStatus =
      statusFilter === 'ALL' ||
      s.compliance_status === statusFilter;

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