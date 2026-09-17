// frontend/src/pages/EmployeesPage.jsx

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { Typography, Button, Alert, Chip, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Box, Tooltip, IconButton, InputAdornment, OutlinedInput, TablePagination, Switch, Stack, Menu, MenuItem } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LinkIcon from '@mui/icons-material/Link';
import EmployeeForm from '../components/EmployeeForm';
import PublicFormLinkGenerator from '../components/PublicFormLinkGenerator';
import AdminEmployeeProfileDialog from '../components/AdminEmployeeProfileDialog';
import PageHeroHeader from '../components/PageHeroHeader';
import UserAvatar from '../components/common/UserAvatar'; // CENTRALIZED AVATAR COMPONENT
import socket from '../socket';
import '../styles/EmployeesPage.css';

import { SkeletonBox } from '../components/SkeletonLoaders';
// --- HELPER FUNCTIONS ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    const options = { day: '2-digit', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('en-GB', options).replace(/ /g, '-');
};

// --- SORTING HELPER FUNCTIONS ---
function descendingComparator(a, b, orderBy) {
    const valA = a[orderBy] || '';
    const valB = b[orderBy] || '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator(order, orderBy) {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

function stableSort(array, comparator) {
  const stabilizedThis = array.map((el, index) => [el, index]);
  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) return order;
    return a[1] - b[1];
  });
  return stabilizedThis.map((el) => el[0]);
}

const headCells = [
  { id: 'employeeCode', numeric: false, label: 'Employee ID' },
  { id: 'fullName', numeric: false, label: 'Name' },
  { id: 'joiningDate', numeric: false, label: 'Joining Date' },
  { id: 'role', numeric: false, label: 'Role' },
  { id: 'isActive', numeric: false, label: 'Status' },
  { id: 'actions', numeric: true, disableSorting: true, label: 'Actions' },
];

const EmployeesPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [employees, setEmployees] = useState([]);
    const [allShifts, setAllShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [deleteDialog, setDeleteDialog] = useState({ open: false, employee: null });
    const [updatingStatus, setUpdatingStatus] = useState({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [profileDialog, setProfileDialog] = useState({ open: false, employee: null, mode: 'view' });
    const [linkGeneratorDialog, setLinkGeneratorDialog] = useState({ open: false, employee: null });
    const initialLoadRef = useRef(true);
    const searchDebounceRef = useRef(null);
    const allEmployeesRef = useRef([]);
    const profileModalOpenedRef = useRef(false);
    
    // State for dynamic features
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [order, setOrder] = useState('asc');
    const [orderBy, setOrderBy] = useState('fullName');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [menuAnchorEl, setMenuAnchorEl] = useState(null);

    // Debounce: only update debouncedSearch after user stops typing for 400ms
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(0);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchInitialData = useCallback(async () => {
        const useInitialLoader = initialLoadRef.current;
        const currentSearch = debouncedSearch;
        
        if (useInitialLoader) {
            setLoading(true);
        } else {
            setIsRefreshing(true);
        }
        
        try {
            // PERFORMANCE FIX: Always use paginated endpoint with server-side search.
            // Previously, any search triggered ?all=true fetching the entire employee list.
            // Now we pass the search term to the backend and always get a paginated slice.
            const searchParam = currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : '';
            const empsRes = await api.get(
                `/admin/employees?page=${page + 1}&limit=${rowsPerPage}&status=active${searchParam}`
            );
            
            let emps = [];
            if (empsRes.data.employees) {
                emps = Array.isArray(empsRes.data.employees) ? empsRes.data.employees : [];
                setTotalCount(empsRes.data.totalCount || 0);
            } else {
                emps = Array.isArray(empsRes.data) ? empsRes.data : [];
                setTotalCount(emps.length);
            }
            setEmployees(emps);
            allEmployeesRef.current = []; // No longer needed with server-side search
        } catch (err) {
            setError('Failed to fetch initial page data.');
            console.error(err);
        } finally {
            if (useInitialLoader) {
                setLoading(false);
                initialLoadRef.current = false;
            } else {
                setIsRefreshing(false);
            }
        }
    }, [page, rowsPerPage, debouncedSearch]);

    // Fetch shifts ONCE on mount — they rarely change so no need to refetch on every data refresh
    useEffect(() => {
        api.get('/admin/shifts').then(shiftsRes => {
            if (shiftsRes.data.shifts) {
                setAllShifts(Array.isArray(shiftsRes.data.shifts) ? shiftsRes.data.shifts : []);
            } else {
                setAllShifts(Array.isArray(shiftsRes.data) ? shiftsRes.data : []);
            }
        }).catch(err => {
            console.error('[EmployeesPage] Failed to fetch shifts:', err);
        });
    }, []); // Empty deps: run once on mount only

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);
    
    // POLLING REMOVED: Socket events provide real-time updates
    // Listen for attendance_log_updated events instead of polling
    useEffect(() => {
        if (!socket) return;

        const handleAttendanceUpdate = () => {
            console.log('[EmployeesPage] Received attendance_log_updated event, refreshing data');
            fetchInitialData();
        };

        socket.on('attendance_log_updated', handleAttendanceUpdate);

        // Fallback: Refresh on visibility change if socket disconnected
        const handleVisibilityChange = () => {
            if (!document.hidden && socket.disconnected) {
                console.log('[EmployeesPage] Socket disconnected, refreshing on visibility change');
                fetchInitialData();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            socket.off('attendance_log_updated', handleAttendanceUpdate);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchInitialData]);

    // Handle URL params to open employee profile modal
    useEffect(() => {
        const employeeId = searchParams.get('employeeId');
        const openProfile = searchParams.get('openProfile');
        
        console.log('[EmployeesPage] URL params check:', { employeeId, openProfile, employeesCount: employees.length, loading });
        
        // Reset the ref when params change
        if (!employeeId || openProfile !== 'true') {
            profileModalOpenedRef.current = false;
            return;
        }
        
        // Prevent opening multiple times
        if (profileModalOpenedRef.current) {
            return;
        }
        
        if (employeeId && openProfile === 'true') {
            console.log('[EmployeesPage] Opening profile for employee:', employeeId);
            profileModalOpenedRef.current = true;
            
            // Fetch all employees and find the one we need
            // This is necessary because there's no single employee GET endpoint
            api.get('/admin/employees?all=true')
                .then(({ data }) => {
                    const employeeList = Array.isArray(data) ? data : [];
                    const employee = employeeList.find(emp => emp._id === employeeId || emp._id?.toString() === employeeId);
                    
                    if (employee) {
                        console.log('[EmployeesPage] Employee found, opening modal');
                        // Use a longer delay to ensure the page is fully rendered
                        setTimeout(() => {
                            setProfileDialog({ open: true, employee, mode: 'view' });
                            console.log('[EmployeesPage] Profile dialog opened for:', employee.fullName);
                            // Clean up URL params
                            const newSearchParams = new URLSearchParams(searchParams);
                            newSearchParams.delete('employeeId');
                            newSearchParams.delete('openProfile');
                            setSearchParams(newSearchParams, { replace: true });
                        }, 300);
                    } else {
                        console.warn('[EmployeesPage] Employee not found in list:', employeeId);
                        profileModalOpenedRef.current = false;
                        // Clean up URL params
                        const newSearchParams = new URLSearchParams(searchParams);
                        newSearchParams.delete('employeeId');
                        newSearchParams.delete('openProfile');
                        setSearchParams(newSearchParams, { replace: true });
                    }
                })
                .catch((error) => {
                    console.error('[EmployeesPage] Failed to fetch employees:', error);
                    profileModalOpenedRef.current = false;
                    // Clean up URL params even on error
                    const newSearchParams = new URLSearchParams(searchParams);
                    newSearchParams.delete('employeeId');
                    newSearchParams.delete('openProfile');
                    setSearchParams(newSearchParams, { replace: true });
                });
        }
    }, [searchParams, setSearchParams]);

    const handleOpenForm = (employee = null) => {
        setSelectedEmployee(employee);
        setIsFormOpen(true);
    };

    const handleOpenProfileDialog = (employee, mode = 'view') => {
        setProfileDialog({ open: true, employee, mode });
    };

    const handleNavigateToCIF = (employee, event) => {
        if (event && event.stopPropagation) event.stopPropagation();
        navigate(`/admin/cif/employee/${employee._id}`);
    };

    const handleCloseProfileDialog = () => {
        setProfileDialog({ open: false, employee: null, mode: 'view' });
    };

    const handleOpenAdvancedEditor = () => {
        if (!profileDialog.employee) return;
        const employeeRecord = profileDialog.employee;
        handleCloseProfileDialog();
        setTimeout(() => handleOpenForm(employeeRecord), 0);
    };
    
    const handleCloseForm = () => {
        setSelectedEmployee(null);
        setIsFormOpen(false);
    };

    const handleSaveEmployee = async (employeeData) => {
        try {
            if (selectedEmployee) {
                const { data } = await api.put(`/admin/employees/${selectedEmployee._id}`, employeeData);
                setSnackbar({ open: true, message: data.message || 'Employee updated successfully!', severity: 'success' });
            } else {
                const { data } = await api.post('/admin/employees', employeeData);
                setSnackbar({ open: true, message: data.message || 'Employee added successfully!', severity: 'success' });
            }
            await fetchInitialData();
            handleCloseForm();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save employee.', severity: 'error' });
        }
    };

    const confirmDeleteEmployee = async () => {
        const employeeToDelete = deleteDialog.employee;
        if (!employeeToDelete) return;
        try {
            await api.delete(`/admin/employees/${employeeToDelete._id}`);
            setSnackbar({ open: true, message: 'Employee deleted successfully!', severity: 'success' });
            setDeleteDialog({ open: false, employee: null });
            await fetchInitialData();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete employee.', severity: 'error' });
        }
    };

    const handleToggleActive = async (employee, event) => {
        // Prevent row clicks or other handlers
        if (event && event.stopPropagation) event.stopPropagation();

        const id = employee._id;
        const newValue = !employee.isActive;
        setUpdatingStatus(prev => ({ ...prev, [id]: true }));
        try {
            await api.put(`/admin/employees/${id}`, { isActive: newValue });
            setSnackbar({ open: true, message: `${employee.fullName} has been ${newValue ? 'activated' : 'deactivated'}.`, severity: 'success' });
            // Refresh list
            await fetchInitialData();
        } catch (err) {
            console.error('Failed to update employee status:', err);
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to update status.', severity: 'error' });
        } finally {
            setUpdatingStatus(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleRequestSort = (property) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };
    
    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    // With server-side search and pagination, employees already contain the correct filtered/paged slice.
    // filteredEmployees is kept for TablePagination count purposes.
    const filteredEmployees = employees;
    
    const visibleRows = useMemo(() => {
        // Sort client-side (within the current page) for instant column sort feel
        return stableSort(employees, getComparator(order, orderBy));
    }, [employees, order, orderBy]);

    const handleMenuOpen = (event) => {
        setMenuAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setMenuAnchorEl(null);
    };

    const handleViewDeactivated = () => {
        handleMenuClose();
        navigate('/employees/deactivated');
    };

    const actionArea = useMemo(() => (
        <Stack
            direction="row"
            spacing={1.5}
            flexWrap="wrap"
            alignItems="center"
            className="header-actions"
        >
            <OutlinedInput
                size="small"
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startAdornment={
                    <InputAdornment position="start">
                        <SearchIcon sx={{ color: '#6c757d', fontSize: '1.2rem' }} />
                    </InputAdornment>
                }
                endAdornment={
                    searchQuery && (
                        <InputAdornment position="end">
                            <IconButton
                                size="small"
                                onClick={() => setSearchQuery('')}
                                edge="end"
                                sx={{ padding: '4px' }}
                            >
                                <ClearIcon sx={{ fontSize: '1rem' }} />
                            </IconButton>
                        </InputAdornment>
                    )
                }
                sx={{
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    minWidth: '280px',
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#dee2e6',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#adb5bd',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#D32F2F',
                        borderWidth: '2px',
                    },
                    '& input': {
                        padding: '8px 8px 8px 0',
                        fontSize: '0.9rem',
                    }
                }}
            />
            {isRefreshing && (
                <Box className="employees-refresh-indicator" aria-label="Refreshing employees">
                    <SkeletonBox width="22px" height="22px" borderRadius="50%" />
                </Box>
            )}
            <Button 
                variant="contained" 
                onClick={() => handleOpenForm()} 
                startIcon={<AddIcon />} 
                className="add-button"
            >
                Add Employee
            </Button>
            <IconButton
                onClick={handleMenuOpen}
                sx={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '8px',
                    '&:hover': {
                        backgroundColor: '#f8f9fa',
                        borderColor: '#adb5bd',
                    }
                }}
            >
                <MoreVertIcon sx={{ fontSize: '1.2rem', color: '#495057' }} />
            </IconButton>
        </Stack>
    ), [searchQuery, isRefreshing]);

    if (loading) return <div className="flex-center"><SkeletonBox width="24px" height="24px" borderRadius="50%" /></div>;

    return (
        <div className="employees-page">
            <PageHeroHeader
                eyebrow="People Directory"
                title="Manage Employees"
                description="Search, onboard, and manage employee records."
                actionArea={actionArea}
            />

            {error && <Alert severity="error" className="error-alert">{error}</Alert>}
            
            <div className="employees-card">
                {/* --- NEW DIV-BASED TABLE --- */}
                <div className="employee-grid-table">
                    <div className="employee-grid-header">
                        <div className="grid-cell serial-number">S.No.</div>
                        {headCells.map((headCell) => (
                            !headCell.disableSorting ? (
                                <div key={headCell.id} className={`grid-cell ${headCell.id}`} onClick={() => handleRequestSort(headCell.id)}>
                                    {headCell.label}
                                    {orderBy === headCell.id && (
                                        <ArrowUpwardIcon className={`sort-arrow ${order}`} />
                                    )}
                                </div>
                            ) : (
                                <div key={headCell.id} className={`grid-cell ${headCell.id}`}>{headCell.label}</div>
                            )
                        ))}
                    </div>
                    <div className="employee-grid-body">
                        {visibleRows.length > 0 ? visibleRows.map((employee, index) => (
                            <div className="employee-grid-row" key={employee._id}>
                                <div className="grid-cell serial-number" data-label="S.No.">{page * rowsPerPage + index + 1}</div>
                                <div className="grid-cell employeeCode" data-label="Employee ID">{employee.employeeCode}</div>
                                <div className="grid-cell fullName" data-label="Name">
                                    <UserAvatar user={employee} size="sm" lazy />
                                    <div className="employee-text-info">
                                        <div className="employee-name">{employee.fullName}</div>
                                        <div className="employee-email">{employee.email}</div>
                                    </div>
                                </div>
                                <div className="grid-cell joiningDate" data-label="Joining Date">{formatDate(employee.joiningDate)}</div>
                                <div className="grid-cell role" data-label="Role">{employee.role}</div>
                                <div className="grid-cell isActive" data-label="Status">
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Switch
                                            checked={!!employee.isActive}
                                            onChange={(e) => handleToggleActive(employee, e)}
                                            color="primary"
                                            size="small"
                                            inputProps={{ 'aria-label': `Toggle active for ${employee.fullName}` }}
                                        />
                                        {updatingStatus[employee._id] ? (
                                            <SkeletonBox width="16px" height="16px" borderRadius="50%" />
                                        ) : (
                                            <Chip label={employee.isActive ? 'Active' : 'Inactive'} color={employee.isActive ? 'success' : 'error'} size="small" variant="outlined" />
                                        )}
                                    </Box>
                                </div>
                                <div className="grid-cell actions" data-label="Actions">
                                    <Tooltip title="View Details">
                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenProfileDialog(employee, 'view'); }}>
                                            <VisibilityOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="View CIF Records">
                                        <IconButton 
                                            size="small" 
                                            onClick={(e) => handleNavigateToCIF(employee, e)}
                                            sx={{
                                                '&:hover': {
                                                    backgroundColor: 'rgba(220, 38, 38, 0.08)',
                                                    '& svg': {
                                                        color: '#DC2626'
                                                    }
                                                }
                                            }}
                                            aria-label="View CIF Records"
                                        >
                                            <DescriptionOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Edit Profile">
                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenForm(employee); }}>
                                            <EditOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Generate Profile Link">
                                        <IconButton
                                            size="small"
                                            onClick={(e) => { e.stopPropagation(); setLinkGeneratorDialog({ open: true, employee }); }}
                                            sx={{
                                                '&:hover': {
                                                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                                                    '& svg': { color: '#667eea' }
                                                }
                                            }}
                                        >
                                            <LinkIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete"><IconButton size="small" onClick={() => setDeleteDialog({ open: true, employee })}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                                </div>
                            </div>
                        )) : (
                            <div className="empty-state">No employees found.</div>
                        )}
                    </div>
                </div>
                
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    component="div"
                    count={totalCount}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </div>

            <EmployeeForm open={isFormOpen} onClose={handleCloseForm} onSave={handleSaveEmployee} employee={selectedEmployee} shifts={allShifts} />
            
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, employee: null })}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete employee "{deleteDialog.employee?.fullName}"? 
                        This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ open: false, employee: null })}>
                        Cancel
                    </Button>
                    <Button onClick={confirmDeleteEmployee} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
            </Snackbar>

            <Menu
                anchorEl={menuAnchorEl}
                open={Boolean(menuAnchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                PaperProps={{
                    sx: {
                        mt: 1,
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        minWidth: '200px',
                    }
                }}
            >
                <MenuItem 
                    onClick={handleViewDeactivated}
                    sx={{
                        py: 1.5,
                        px: 2,
                        '&:hover': {
                            backgroundColor: 'rgba(211, 47, 47, 0.08)',
                        }
                    }}
                >
                    View Deactivated Employees
                </MenuItem>
            </Menu>

            <AdminEmployeeProfileDialog
                open={profileDialog.open}
                mode={profileDialog.mode}
                employee={profileDialog.employee}
                onClose={handleCloseProfileDialog}
                onSaved={async () => {
                    await fetchInitialData();
                    handleCloseProfileDialog();
                }}
                onOpenAdvancedEditor={profileDialog.employee ? handleOpenAdvancedEditor : undefined}
            />

            {linkGeneratorDialog.open && (
                <PublicFormLinkGenerator
                    employeeId={linkGeneratorDialog.employee?.employeeCode}
                    employeeName={linkGeneratorDialog.employee?.fullName}
                    onClose={() => setLinkGeneratorDialog({ open: false, employee: null })}
                />
            )}
        </div>
    );
};

export default EmployeesPage;