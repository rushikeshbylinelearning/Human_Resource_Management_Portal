import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

const ActiveYearContext = createContext();

export const ActiveYearProvider = ({ children }) => {
    const { authStatus, user } = useAuth();
    const [activeYear, setActiveYear] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchActiveYear = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            
            const response = await api.get('/admin/leave-years/active');
            setActiveYear(response.data);
        } catch (err) {
            const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Failed to fetch active year';
            setError(errorMessage);
            setActiveYear(null);
            
            // Don't log error if it's just "no active year found" - this is expected on first setup
            if (!errorMessage.includes('No active leave year found')) {
                console.error('Error fetching active year:', err);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authStatus !== 'authenticated') {
            setActiveYear(null);
            setError(null);
            setLoading(false);
            return;
        }

        if (user?.role !== 'Admin' && user?.role !== 'HR') {
            setActiveYear(null);
            setError(null);
            setLoading(false);
            return;
        }

        fetchActiveYear();
    }, [authStatus, user?.role, fetchActiveYear]);

    const refreshActiveYear = useCallback(() => {
        return fetchActiveYear();
    }, [fetchActiveYear]);

    const value = {
        activeYear,
        loading,
        error,
        refreshActiveYear
    };

    return (
        <ActiveYearContext.Provider value={value}>
            {children}
        </ActiveYearContext.Provider>
    );
};

export const useActiveYear = () => {
    const context = useContext(ActiveYearContext);
    
    if (context === undefined) {
        throw new Error('useActiveYear must be used within an ActiveYearProvider');
    }
    
    return context;
};

export default ActiveYearContext;
