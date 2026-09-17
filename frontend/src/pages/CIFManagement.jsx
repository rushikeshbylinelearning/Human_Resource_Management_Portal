import React, { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Typography,
  Avatar
} from '@mui/material';
import {
  Search as SearchIcon,
  FolderOpen as FolderOpenIcon,
  ChevronRight as ChevronRightIcon,
  Person as PersonIcon,
  Add as AddIcon
} from '@mui/icons-material';
import api from '../api/axios';
import CIFDrawer from '../components/CIF/CIFDrawer';
import PageHeroHeader from '../components/PageHeroHeader';
import '../styles/CIFManagement.css';

const API_BASE = '/admin/cif';

// Memoized employee table row
const EmployeeTableRow = memo(({ employee, onViewCIFs, getRiskLevelColor }) => {
  const riskColors = getRiskLevelColor(employee.riskLevel || 'low');
  
  return (
    <TableRow 
      hover
      sx={{
        cursor: 'pointer',
        '&:hover': {
          bgcolor: '#F9FAFB'
        },
        transition: 'background-color 0.2s ease'
      }}
      onClick={() => onViewCIFs(employee)}
    >
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: '#DC2626',
              fontSize: '1rem',
              fontWeight: 600
            }}
          >
            {employee.fullName?.charAt(0) || 'U'}
          </Avatar>
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ color: '#111827' }}>
              {employee.fullName}
            </Typography>
            <Typography variant="caption" sx={{ color: '#6B7280' }}>
              {employee.employeeCode}
            </Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ color: '#6B7280' }}>
          {employee.department || 'N/A'}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ color: '#6B7280' }}>
          {employee.email}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" fontWeight={600} sx={{ color: '#111827' }}>
          {employee.cifCount || 0}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" fontWeight={600} sx={{ color: '#DC2626' }}>
          {employee.openCases || 0}
        </Typography>
      </TableCell>
      <TableCell>
        <Chip
          label={employee.riskLevel?.toUpperCase() || 'LOW'}
          sx={{
            bgcolor: riskColors.bg,
            color: riskColors.text,
            border: `1px solid ${riskColors.border}`,
            fontWeight: 600,
            fontSize: '0.75rem',
            height: '28px',
            borderRadius: '14px'
          }}
        />
      </TableCell>
      <TableCell align="right">
        <IconButton
          size="small"
          sx={{
            color: '#6B7280',
            '&:hover': {
              bgcolor: '#F3F4F6',
              color: '#DC2626'
            }
          }}
        >
          <ChevronRightIcon />
        </IconButton>
      </TableCell>
    </TableRow>
  );
});

EmployeeTableRow.displayName = 'EmployeeTableRow';

const CIFManagement = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [stats, setStats] = useState({ total: 0, openCases: 0, highSeverity: 0 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounce(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        page: page + 1,
        limit: rowsPerPage,
        ...(searchDebounce && { search: searchDebounce })
      };
      const response = await api.get('/admin/cif/employees-with-cif', { params });
      setEmployees(response.data.employees);
      setTotal(response.data.pagination.total);
    } catch (err) {
      console.error('Error fetching employees:', err);
      const errorMsg = err.code === 'ERR_NETWORK' || err.message.includes('Network Error')
        ? 'Backend server is not running. Please start the server.'
        : err.response?.data?.error || 'Failed to fetch employees';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchDebounce]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get(`${API_BASE}/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleChangePage = useCallback((event, newPage) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  const handleViewCIFs = useCallback((employee) => {
    navigate(`/admin/cif/employee/${employee._id}`);
  }, [navigate]);

  const getRiskLevelColor = useCallback((level) => {
    const colors = {
      critical: { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
      high: { bg: '#FED7AA', text: '#EA580C', border: '#FDBA74' },
      medium: { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
      low: { bg: '#D1FAE5', text: '#059669', border: '#A7F3D0' }
    };
    return colors[level] || colors.low;
  }, []);

  const handleOpenDrawer = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedEmployee(null);
  }, []);

  const handleSaveSuccess = useCallback(() => {
    handleCloseDrawer();
    fetchEmployees();
    fetchStats();
  }, [handleCloseDrawer, fetchEmployees, fetchStats]);

  return (
    <Box className="cif-management-page">
      {/* Hero Header with Search */}
      <PageHeroHeader
        eyebrow="HR Operations"
        title="Critical Incident Files"
        description="Manage and track employee incident records, compliance violations, and HR documentation"
        icon={<FolderOpenIcon />}
        actionArea={
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', width: '100%', minWidth: 0 }}>
            {/* Compact Search Bar */}
            <TextField
              placeholder="Search by employee name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.25rem' }} />
                  </InputAdornment>
                )
              }}
              sx={{
                width: { xs: '100%', sm: 'auto' },
                minWidth: { xs: 0, sm: '320px' },
                flex: { xs: '1 1 100%', sm: '1 1 320px' },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px',
                  bgcolor: 'white',
                  border: '1px solid #E5E7EB',
                  fontSize: '0.875rem',
                  '& input': {
                    padding: '10px 8px'
                  },
                  '&:hover': {
                    borderColor: '#DC2626',
                    '& fieldset': {
                      borderColor: '#DC2626'
                    }
                  },
                  '&.Mui-focused': {
                    '& fieldset': {
                      borderColor: '#DC2626',
                      borderWidth: '2px'
                    },
                    boxShadow: '0 0 0 3px rgba(220, 38, 38, 0.1)'
                  }
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  border: 'none'
                }
              }}
            />
            
            {/* New CIF Button */}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenDrawer}
              sx={{
                bgcolor: '#DC2626',
                color: 'white',
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                py: 1.25,
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                whiteSpace: 'nowrap',
                '&:hover': {
                  bgcolor: '#B91C1C',
                  boxShadow: '0 6px 16px rgba(220, 38, 38, 0.4)'
                },
                transition: 'all 0.2s ease-in-out'
              }}
            >
              New CIF
            </Button>
          </Box>
        }
      />

      {/* KPI Cards Section */}
      <Box 
        sx={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 3,
          mb: 4
        }}
      >
        {/* Total CIF Card */}
        <Card
          elevation={0}
          sx={{
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            p: 3,
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: '0 4px 12px 0 rgba(0, 0, 0, 0.1)',
              transform: 'translateY(-2px)'
            }
          }}
        >
          <Typography 
            variant="caption" 
            sx={{ 
              color: '#6B7280',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.75rem'
            }}
          >
            Total CIF
          </Typography>
          <Typography 
            variant="h3" 
            sx={{ 
              fontWeight: 700,
              color: '#111827',
              mt: 1,
              mb: 0.5
            }}
          >
            {stats.total}
          </Typography>
          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
            All records
          </Typography>
        </Card>

        {/* Open Cases Card */}
        <Card
          elevation={0}
          sx={{
            borderRadius: '16px',
            border: '1px solid #FEE2E2',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            p: 3,
            bgcolor: '#FEF2F2',
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: '0 4px 12px 0 rgba(220, 38, 38, 0.15)',
              transform: 'translateY(-2px)'
            }
          }}
        >
          <Typography 
            variant="caption" 
            sx={{ 
              color: '#DC2626',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.75rem'
            }}
          >
            Open Cases
          </Typography>
          <Typography 
            variant="h3" 
            sx={{ 
              fontWeight: 700,
              color: '#DC2626',
              mt: 1,
              mb: 0.5
            }}
          >
            {stats.openCases}
          </Typography>
          <Typography variant="caption" sx={{ color: '#DC2626', opacity: 0.7 }}>
            Requires attention
          </Typography>
        </Card>

        {/* High Severity Card */}
        <Card
          elevation={0}
          sx={{
            borderRadius: '16px',
            border: '1px solid #FED7AA',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            p: 3,
            bgcolor: '#FFF7ED',
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: '0 4px 12px 0 rgba(245, 158, 11, 0.15)',
              transform: 'translateY(-2px)'
            }
          }}
        >
          <Typography 
            variant="caption" 
            sx={{ 
              color: '#F59E0B',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.75rem'
            }}
          >
            High Severity
          </Typography>
          <Typography 
            variant="h3" 
            sx={{ 
              fontWeight: 700,
              color: '#F59E0B',
              mt: 1,
              mb: 0.5
            }}
          >
            {stats.highSeverity}
          </Typography>
          <Typography variant="caption" sx={{ color: '#F59E0B', opacity: 0.7 }}>
            Critical incidents
          </Typography>
        </Card>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 3, 
            borderRadius: '16px',
            border: '1px solid #FEE2E2',
            bgcolor: '#FEF2F2'
          }} 
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      {/* Employees Table Card */}
      <Card 
        elevation={0}
        sx={{
          borderRadius: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ p: 3, borderBottom: '1px solid #E5E7EB' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>
            Employees with CIF Records
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>
            Click on an employee to view their incident records
          </Typography>
        </Box>
        <TableContainer>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Employee</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Department</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Email</TableCell>
                <TableCell align="center" sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Total CIF</TableCell>
                <TableCell align="center" sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Open Cases</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Risk Level</TableCell>
                <TableCell align="right" sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                    <CircularProgress sx={{ color: '#DC2626' }} size={40} />
                  </TableCell>
                </TableRow>
              ) : employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <PersonIcon sx={{ fontSize: 48, color: '#D1D5DB' }} />
                      <Typography variant="body1" color="textSecondary">
                        {error ? 'Unable to load employees' : 'No employees with CIF records found'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((employee) => (
                  <EmployeeTableRow
                    key={employee._id}
                    employee={employee}
                    onViewCIFs={handleViewCIFs}
                    getRiskLevelColor={getRiskLevelColor}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          sx={{
            borderTop: '1px solid #E5E7EB',
            bgcolor: '#F9FAFB'
          }}
        />
      </Card>

      {/* CIF Drawer */}
      <CIFDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        mode="create"
        record={selectedEmployee}
        onSaveSuccess={handleSaveSuccess}
      />
    </Box>
  );
};

export default CIFManagement;
