import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
    Tabs, Tab, Switch, FormControlLabel, FormControl, InputLabel, Select, MenuItem,
    TextField, Alert, CircularProgress, Autocomplete, Chip, Stack, Divider,
} from '@mui/material';
import LazyDatePicker from '../lazy/LazyDatePicker';
import api from '../../api/axios';
import {
    RED, TEXT, MUTED, BORDER, SURFACE, FONT, WARN_BG, WARN_TEXT, primaryBtnSx, ghostBtnSx, fieldSx,
} from '../../theme/policiesPageTheme';

const tabSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontFamily: FONT,
    minHeight: 44,
    fontSize: '0.82rem',
};

const EmployeePicker = ({ employees, selected, onChange, disabled, helper }) => (
    <Autocomplete
        multiple
        options={employees}
        getOptionLabel={(option) =>
            `${option.fullName} (${option.employeeCode})${option.department ? ` · ${option.department}` : ''}`
        }
        value={selected}
        onChange={(e, value) => onChange(value)}
        disabled={disabled}
        renderInput={(params) => (
            <TextField
                {...params}
                label="Select employees"
                placeholder={employees.length === 0 ? 'No employees available' : 'Search employees'}
                helperText={helper}
                sx={fieldSx}
            />
        )}
        renderTags={(value, getTagProps) =>
            value.map((option, index) => (
                <Chip
                    key={option._id}
                    size="small"
                    label={`${option.fullName} (${option.employeeCode})`}
                    {...getTagProps({ index })}
                />
            ))
        }
    />
);

const ResultAlert = ({ result }) => {
    if (!result) return null;
    return (
        <Alert severity={result.failed?.length ? 'warning' : 'success'}>
            Assigned: {result.success?.length || 0}
            {result.alreadyAccepted?.length ? ` · Already done: ${result.alreadyAccepted.length}` : ''}
            {result.failed?.length ? ` · Failed: ${result.failed.length}` : ''}
        </Alert>
    );
};

const OnboardingControlPanel = ({ open, onClose, onSaved, initialTab = 0, templateId = null }) => {
    const [tab, setTab] = useState(templateId ? 1 : initialTab);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [policies, setPolicies] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [control, setControl] = useState({
        requirePolicyOnFirstLogin: true,
        requireTourOnFirstLogin: true,
        requireProfileOnFirstLogin: true,
        firstLoginSource: 'policy',
        mandatoryPolicyId: '',
        mandatoryTemplateId: '',
        deadlineDays: 7,
    });

    const [noticeMode, setNoticeMode] = useState(templateId ? 'template' : 'policy');
    const [selectedPolicy, setSelectedPolicy] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState(templateId || '');
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [assignToAll, setAssignToAll] = useState(false);
    const [confirmBulk, setConfirmBulk] = useState(false);
    const [deadline, setDeadline] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const [assignResult, setAssignResult] = useState(null);
    const [confirmRestart, setConfirmRestart] = useState(false);

    useEffect(() => {
        if (!open) return;
        setTab(templateId ? 1 : initialTab);
        setError('');
        setSuccess('');
        setAssignResult(null);
        setAssignToAll(false);
        setConfirmBulk(false);
        setConfirmRestart(false);
        setSelectedEmployees([]);
        setNoticeMode(templateId ? 'template' : 'policy');
        setSelectedTemplate(templateId || '');
        setSelectedPolicy('');
        setDeadline(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        loadAll();
    }, [open, templateId, initialTab]);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [controlRes, policyRes, templateRes, employeeRes] = await Promise.all([
                api.get('/onboarding/admin/control'),
                api.get('/policies', { params: { status: 'Active' } }),
                api.get('/policy-templates'),
                api.get('/admin/employees', { params: { all: true, status: 'active', slim: true } }),
            ]);
            const c = controlRes.data.control || {};
            setControl({
                requirePolicyOnFirstLogin: c.requirePolicyOnFirstLogin !== false,
                requireTourOnFirstLogin: c.requireTourOnFirstLogin !== false,
                requireProfileOnFirstLogin: c.requireProfileOnFirstLogin !== false,
                firstLoginSource: c.firstLoginSource || 'policy',
                mandatoryPolicyId: c.mandatoryPolicyId || '',
                mandatoryTemplateId: c.mandatoryTemplateId || '',
                deadlineDays: c.deadlineDays || 7,
            });
            setPolicies((Array.isArray(policyRes.data) ? policyRes.data : (policyRes.data.policies || []))
                .filter((p) => p.sourceKind !== 'consent_template'));
            setTemplates((templateRes.data.templates || []).filter((t) => t.status === 'active'));
            const list = Array.isArray(employeeRes.data) ? employeeRes.data : [];
            setEmployees(list.filter((e) => e.role === 'Employee' || e.role === 'Intern'));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load control panel');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveFirstLogin = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const { data } = await api.put('/onboarding/admin/control', {
                requirePolicyOnFirstLogin: control.requirePolicyOnFirstLogin,
                requireTourOnFirstLogin: control.requireTourOnFirstLogin,
                requireProfileOnFirstLogin: control.requireProfileOnFirstLogin,
                firstLoginSource: control.requirePolicyOnFirstLogin ? control.firstLoginSource : 'none',
                mandatoryPolicyId: control.mandatoryPolicyId || null,
                mandatoryTemplateId: control.mandatoryTemplateId || null,
                deadlineDays: Number(control.deadlineDays),
            });
            setSuccess('First-login settings saved. New employees will see this sequence on their next login.');
            if (onSaved) onSaved(data.control);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleAssignNotice = async () => {
        if (!assignToAll && selectedEmployees.length === 0) {
            setError('Select employees or confirm assign to all.');
            return;
        }
        if (assignToAll && !confirmBulk) {
            setError('Tick the confirmation box before assigning to everyone.');
            return;
        }
        setSaving(true);
        setError('');
        setAssignResult(null);
        try {
            let response;
            if (noticeMode === 'template') {
                response = await api.post('/onboarding/admin/assign-template-to-users', {
                    templateId: selectedTemplate,
                    deadline: deadline.toISOString(),
                    assignToAll,
                    confirmAssignAll: confirmBulk,
                    userIds: assignToAll ? undefined : selectedEmployees.map((e) => e._id),
                });
            } else if (assignToAll) {
                response = await api.post('/onboarding/admin/assign-policy-to-all', {
                    policyId: selectedPolicy,
                    deadline: deadline.toISOString(),
                    confirmAssignAll: true,
                });
            } else {
                response = await api.post('/onboarding/admin/assign-policy-to-users', {
                    policyId: selectedPolicy,
                    deadline: deadline.toISOString(),
                    userIds: selectedEmployees.map((e) => e._id),
                });
            }
            setAssignResult(response.data.results);
            if (onSaved) onSaved(response.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to assign notice');
        } finally {
            setSaving(false);
        }
    };

    const handleAssignTour = async () => {
        if (!assignToAll && selectedEmployees.length === 0) {
            setError('Select employees or confirm assign to all.');
            return;
        }
        if (assignToAll && !confirmBulk) {
            setError('Tick the confirmation box before assigning the tour to everyone.');
            return;
        }
        setSaving(true);
        setError('');
        setAssignResult(null);
        try {
            const { data } = await api.post('/onboarding/admin/assign-tour', {
                userIds: assignToAll ? undefined : selectedEmployees.map((e) => e._id),
                assignToAll,
                confirmAssignAll: confirmBulk,
            });
            setAssignResult(data.results);
            setSuccess('Guided tour will appear the next time those employees open the app.');
            if (onSaved) onSaved(data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to assign tour');
        } finally {
            setSaving(false);
        }
    };

    const handleRestart = async () => {
        if (!confirmRestart) {
            setError('Confirm that you want to reset onboarding for the selected employees.');
            return;
        }
        if (selectedEmployees.length === 0) {
            setError('Select specific employees. Restart cannot be applied to everyone at once.');
            return;
        }
        setSaving(true);
        setError('');
        setAssignResult(null);
        try {
            const { data } = await api.post('/onboarding/admin/restart-onboarding', {
                userIds: selectedEmployees.map((e) => e._id),
                confirmRestart: true,
            });
            setAssignResult(data.results);
            setSuccess('Onboarding was reset. Those employees will see the first-login sequence again.');
            if (onSaved) onSaved(data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to restart onboarding');
        } finally {
            setSaving(false);
        }
    };

    const noticeReady = noticeMode === 'template' ? Boolean(selectedTemplate) : Boolean(selectedPolicy);
    const firstLoginReady = !control.requirePolicyOnFirstLogin
        || (control.firstLoginSource === 'template' ? Boolean(control.mandatoryTemplateId) : Boolean(control.mandatoryPolicyId));

    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px', fontFamily: FONT } }}>
            <DialogTitle sx={{ pb: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', color: TEXT, letterSpacing: '-0.02em' }}>
                    Onboarding control panel
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: MUTED, mt: 0.4 }}>
                    Choose what employees see on first login, assign notices or the guided tour, and restart a journey when needed.
                </Typography>
                <Tabs
                    value={tab}
                    onChange={(e, v) => { setTab(v); setError(''); setSuccess(''); setAssignResult(null); }}
                    sx={{ mt: 1.5, minHeight: 44, '& .MuiTabs-indicator': { background: RED } }}
                >
                    <Tab label="First login" sx={tabSx} />
                    <Tab label="Assign notice" sx={tabSx} />
                    <Tab label="Assign tour" sx={tabSx} />
                    <Tab label="Restart" sx={tabSx} />
                </Tabs>
            </DialogTitle>
            <DialogContent dividers sx={{ minHeight: 360 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress sx={{ color: RED }} />
                    </Box>
                ) : (
                    <Stack spacing={2.25}>
                        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
                        {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}
                        <ResultAlert result={assignResult} />

                        {tab === 0 && (
                            <>
                                <Typography sx={{ fontSize: '0.8rem', color: MUTED }}>
                                    These settings apply to new employees (and anyone whose onboarding is restarted). Existing staff are not changed until you assign them something.
                                </Typography>
                                <FormControlLabel
                                    control={<Switch checked={control.requirePolicyOnFirstLogin} onChange={(e) => setControl((c) => ({ ...c, requirePolicyOnFirstLogin: e.target.checked, firstLoginSource: e.target.checked ? (c.firstLoginSource === 'none' ? 'policy' : c.firstLoginSource) : 'none' }))} />}
                                    label={<Box><Typography>Show a notice on first login</Typography><Typography variant="caption" color="text.secondary">Blocks the app until they finish the PDF or consent wizard</Typography></Box>}
                                />
                                {control.requirePolicyOnFirstLogin && (
                                    <>
                                        <FormControl fullWidth sx={fieldSx}>
                                            <InputLabel>What they see</InputLabel>
                                            <Select
                                                value={control.firstLoginSource}
                                                label="What they see"
                                                onChange={(e) => setControl((c) => ({ ...c, firstLoginSource: e.target.value }))}
                                            >
                                                <MenuItem value="policy">PDF policy</MenuItem>
                                                <MenuItem value="template">Consent template</MenuItem>
                                            </Select>
                                        </FormControl>
                                        {control.firstLoginSource === 'template' ? (
                                            <FormControl fullWidth sx={fieldSx}>
                                                <InputLabel>Consent template</InputLabel>
                                                <Select
                                                    value={control.mandatoryTemplateId}
                                                    label="Consent template"
                                                    onChange={(e) => setControl((c) => ({ ...c, mandatoryTemplateId: e.target.value }))}
                                                >
                                                    {templates.map((t) => (
                                                        <MenuItem key={t._id} value={t._id}>{t.name} (v{t.version})</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        ) : (
                                            <FormControl fullWidth sx={fieldSx}>
                                                <InputLabel>PDF policy</InputLabel>
                                                <Select
                                                    value={control.mandatoryPolicyId}
                                                    label="PDF policy"
                                                    onChange={(e) => setControl((c) => ({ ...c, mandatoryPolicyId: e.target.value }))}
                                                >
                                                    {policies.map((p) => (
                                                        <MenuItem key={p._id} value={p._id}>{p.name} (v{p.version})</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        )}
                                    </>
                                )}
                                <Divider />
                                <FormControlLabel
                                    control={<Switch checked={control.requireTourOnFirstLogin} onChange={(e) => setControl((c) => ({ ...c, requireTourOnFirstLogin: e.target.checked }))} />}
                                    label={<Box><Typography>Show the guided tour</Typography><Typography variant="caption" color="text.secondary">Walks through dashboard, attendance, and leave after the notice</Typography></Box>}
                                />
                                <FormControlLabel
                                    control={<Switch checked={control.requireProfileOnFirstLogin} onChange={(e) => setControl((c) => ({ ...c, requireProfileOnFirstLogin: e.target.checked }))} />}
                                    label={<Box><Typography>Require profile completion</Typography><Typography variant="caption" color="text.secondary">Asks them to finish personal and identity details</Typography></Box>}
                                />
                                <TextField
                                    type="number"
                                    label="Deadline (days)"
                                    value={control.deadlineDays}
                                    onChange={(e) => setControl((c) => ({ ...c, deadlineDays: e.target.value }))}
                                    inputProps={{ min: 1, max: 90 }}
                                    helperText="How long they have to finish. Between 1 and 90 days."
                                    sx={{ maxWidth: 220, ...fieldSx }}
                                />
                                <Box sx={{ p: 1.5, borderRadius: '12px', background: SURFACE, border: `1px solid ${BORDER}` }}>
                                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.5 }}>
                                        First-login sequence
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: TEXT }}>
                                        {[
                                            control.requirePolicyOnFirstLogin ? (control.firstLoginSource === 'template' ? 'Consent wizard' : 'PDF policy') : null,
                                            control.requireTourOnFirstLogin ? 'Guided tour' : null,
                                            control.requireProfileOnFirstLogin ? 'Profile' : null,
                                        ].filter(Boolean).join(' → ') || 'Nothing required'}
                                    </Typography>
                                </Box>
                            </>
                        )}

                        {tab === 1 && (
                            <>
                                <Typography sx={{ fontSize: '0.8rem', color: MUTED }}>
                                    Send a notice to people who already work here. They will see it the next time they open the app.
                                </Typography>
                                {!templateId && (
                                    <FormControl fullWidth sx={fieldSx}>
                                        <InputLabel>Notice type</InputLabel>
                                        <Select value={noticeMode} label="Notice type" onChange={(e) => setNoticeMode(e.target.value)}>
                                            <MenuItem value="policy">PDF policy</MenuItem>
                                            <MenuItem value="template">Consent template</MenuItem>
                                        </Select>
                                    </FormControl>
                                )}
                                {noticeMode === 'template' ? (
                                    <FormControl fullWidth sx={fieldSx}>
                                        <InputLabel>Consent template</InputLabel>
                                        <Select value={selectedTemplate} label="Consent template" onChange={(e) => setSelectedTemplate(e.target.value)} disabled={Boolean(templateId)}>
                                            {templates.map((t) => (
                                                <MenuItem key={t._id} value={t._id}>{t.name} (v{t.version})</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                ) : (
                                    <FormControl fullWidth sx={fieldSx}>
                                        <InputLabel>PDF policy</InputLabel>
                                        <Select value={selectedPolicy} label="PDF policy" onChange={(e) => setSelectedPolicy(e.target.value)}>
                                            {policies.map((p) => (
                                                <MenuItem key={p._id} value={p._id}>{p.name} (v{p.version})</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                )}
                                <FormControlLabel
                                    control={<Switch checked={assignToAll} onChange={(e) => { setAssignToAll(e.target.checked); if (e.target.checked) setSelectedEmployees([]); }} />}
                                    label="Assign to all active employees"
                                />
                                {assignToAll ? (
                                    <Alert severity="warning">
                                        This notifies {employees.length} Employee and Intern accounts. Admin and HR are never included.
                                    </Alert>
                                ) : (
                                    <EmployeePicker
                                        employees={employees}
                                        selected={selectedEmployees}
                                        onChange={setSelectedEmployees}
                                        disabled={saving}
                                        helper={selectedEmployees.length ? `${selectedEmployees.length} selected` : 'Admin and HR cannot be selected'}
                                    />
                                )}
                                {assignToAll && (
                                    <FormControlLabel
                                        control={<Switch checked={confirmBulk} onChange={(e) => setConfirmBulk(e.target.checked)} />}
                                        label="I confirm I want to assign this notice to everyone"
                                    />
                                )}
                                <LazyDatePicker
                                        label="Deadline"
                                        value={deadline}
                                        onChange={(v) => setDeadline(v)}
                                        minDate={new Date()}
                                        slotProps={{ textField: { fullWidth: true, sx: fieldSx } }}
                                    />
                            </>
                        )}

                        {tab === 2 && (
                            <>
                                <Typography sx={{ fontSize: '0.8rem', color: MUTED }}>
                                    The guided tour starts after any pending notice. It does not reset policy or profile.
                                </Typography>
                                <FormControlLabel
                                    control={<Switch checked={assignToAll} onChange={(e) => { setAssignToAll(e.target.checked); if (e.target.checked) setSelectedEmployees([]); }} />}
                                    label="Assign tour to all active employees"
                                />
                                {assignToAll ? (
                                    <Alert severity="warning">
                                        {employees.length} employees will see the tour on their next login.
                                    </Alert>
                                ) : (
                                    <EmployeePicker
                                        employees={employees}
                                        selected={selectedEmployees}
                                        onChange={setSelectedEmployees}
                                        disabled={saving}
                                        helper={selectedEmployees.length ? `${selectedEmployees.length} selected` : 'Search by name or employee code'}
                                    />
                                )}
                                {assignToAll && (
                                    <FormControlLabel
                                        control={<Switch checked={confirmBulk} onChange={(e) => setConfirmBulk(e.target.checked)} />}
                                        label="I confirm I want to assign the tour to everyone"
                                    />
                                )}
                            </>
                        )}

                        {tab === 3 && (
                            <>
                                <Alert severity="warning" sx={{ background: WARN_BG, color: WARN_TEXT }}>
                                    Restarting clears notice, tour, and profile progress for the selected people. They will go through first login again. This cannot be applied to everyone at once.
                                </Alert>
                                <EmployeePicker
                                    employees={employees}
                                    selected={selectedEmployees}
                                    onChange={setSelectedEmployees}
                                    disabled={saving}
                                    helper="Select specific employees only"
                                />
                                <FormControlLabel
                                    control={<Switch checked={confirmRestart} onChange={(e) => setConfirmRestart(e.target.checked)} />}
                                    label="I understand this resets their onboarding progress"
                                />
                            </>
                        )}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={onClose} disabled={saving} sx={ghostBtnSx}>Close</Button>
                {tab === 0 && (
                    <Button variant="contained" onClick={handleSaveFirstLogin} disabled={saving || loading || !firstLoginReady} sx={primaryBtnSx}>
                        {saving ? 'Saving…' : 'Save first-login settings'}
                    </Button>
                )}
                {tab === 1 && (
                    <Button variant="contained" onClick={handleAssignNotice} disabled={saving || loading || !noticeReady} sx={primaryBtnSx}>
                        {saving ? 'Assigning…' : 'Assign notice'}
                    </Button>
                )}
                {tab === 2 && (
                    <Button variant="contained" onClick={handleAssignTour} disabled={saving || loading} sx={primaryBtnSx}>
                        {saving ? 'Assigning…' : 'Assign tour'}
                    </Button>
                )}
                {tab === 3 && (
                    <Button variant="contained" onClick={handleRestart} disabled={saving || loading || !confirmRestart || selectedEmployees.length === 0} sx={primaryBtnSx}>
                        {saving ? 'Restarting…' : 'Restart onboarding'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default OnboardingControlPanel;
