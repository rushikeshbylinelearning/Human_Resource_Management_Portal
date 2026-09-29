// frontend/src/components/Dashboard/DashboardSummaryCard.jsx
import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import './DashboardSummaryCard.css';

const DashboardSummaryCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color = 'primary',
    subtitle,
    onClick,
    clickable = false 
}) => {
    const colorMap = {
        primary: '#3498db',
        secondary: '#9b59b6',
        success: '#27ae60',
        warning: '#f39c12',
        error: '#e74c3c',
        info: '#17a2b8',
    };

    const bgColorMap = {
        primary: 'rgba(52, 152, 219, 0.1)',
        secondary: 'rgba(155, 89, 182, 0.1)',
        success: 'rgba(39, 174, 96, 0.12)',
        warning: 'rgba(243, 156, 18, 0.12)',
        error: 'rgba(231, 76, 60, 0.12)',
        info: 'rgba(23, 162, 184, 0.1)',
    };

    return (
        <Card 
            className={`dashboard-summary-card ${clickable ? 'dashboard-summary-card--clickable' : ''}`}
            onClick={clickable ? onClick : undefined}
        >
            <CardContent className="dashboard-summary-card__content">
                <Box className="dashboard-summary-card__main">
                    <Box className="dashboard-summary-card__text">
                        <Typography 
                            variant="body2" 
                            className="dashboard-summary-card__title"
                        >
                            {title}
                        </Typography>
                        <Typography 
                            variant="h4" 
                            component="div" 
                            className="dashboard-summary-card__value"
                        >
                            {value}
                        </Typography>
                        {subtitle && (
                            <Typography 
                                variant="caption" 
                                className="dashboard-summary-card__subtitle"
                            >
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    {Icon && (
                        <Box
                            className="dashboard-summary-card__icon"
                            sx={{
                                backgroundColor: bgColorMap[color] || bgColorMap.primary,
                                color: colorMap[color] || colorMap.primary
                            }}
                        >
                            <Icon sx={{ fontSize: 28 }} />
                        </Box>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
};

export default DashboardSummaryCard;
