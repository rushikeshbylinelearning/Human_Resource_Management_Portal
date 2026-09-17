import React from 'react';
import {
    Box,
    Typography,
    Stack,
    IconButton,
    Chip,
    Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DescriptionIcon from '@mui/icons-material/Description';

const PolicyListCompact = ({ policies, loading, onView, onReplace, onDelete, formatDate }) => {
    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
                Loading policies...
            </Typography>
        );
    }

    if (policies.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <DescriptionIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                <Typography variant="body2" color="text.secondary">
                    No policies uploaded yet
                </Typography>
            </Box>
        );
    }

    return (
        <Stack spacing={1.5}>
            {policies.map((policy) => (
                <Box
                    key={policy._id}
                    sx={{
                        p: 2,
                        border: '1px solid #E5E7EB',
                        borderRadius: '12px',
                        backgroundColor: '#fff',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                            backgroundColor: 'rgba(229, 57, 53, 0.03)',
                            borderColor: '#F5C6C6'
                        }
                    }}
                >
                    <Stack spacing={1}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" fontWeight={600} color="#222" sx={{ mb: 0.5 }}>
                                    {policy.name}
                                </Typography>
                                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                                    <Typography variant="caption" color="text.secondary">
                                        v{policy.version}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        •
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {formatDate(policy.effectiveFrom)}
                                    </Typography>
                                    {policy.department && (
                                        <>
                                            <Typography variant="caption" color="text.secondary">
                                                •
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {policy.department}
                                            </Typography>
                                        </>
                                    )}
                                </Stack>
                            </Box>
                            <Chip
                                label={policy.status}
                                size="small"
                                color={policy.status === 'Active' ? 'success' : 'default'}
                                sx={{ ml: 1, height: '22px', fontSize: '0.7rem' }}
                            />
                        </Box>
                        
                        <Divider sx={{ my: 0.5 }} />
                        
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <IconButton
                                size="small"
                                color="primary"
                                onClick={() => onView(policy)}
                                title="View"
                                sx={{ padding: '4px' }}
                            >
                                <VisibilityIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton
                                size="small"
                                color="warning"
                                onClick={() => onReplace(policy)}
                                title="Replace"
                                sx={{ padding: '4px' }}
                            >
                                <SwapHorizIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => onDelete(policy._id)}
                                title="Delete"
                                sx={{ padding: '4px' }}
                            >
                                <DeleteIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Stack>
                    </Stack>
                </Box>
            ))}
        </Stack>
    );
};

export default PolicyListCompact;
