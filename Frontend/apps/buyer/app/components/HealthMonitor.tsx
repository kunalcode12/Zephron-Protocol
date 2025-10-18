"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@repo/ui/card';
import { Button } from '@repo/ui/button';
import { TextInput } from '@repo/ui/TextInput';
import { Center } from '@repo/ui/Center';

interface HealthData {
  healthFactor: number;
  totalCollateralValue: number;
  totalBorrowedValue: number;
  isMonitoringEnabled: boolean;
  alertThreshold: number;
  lastHealthCheck: number;
  lastAlertSent: number;
  alertFrequencyHours: number;
}

interface HealthMonitorProps {
  userAddress: string;
  onHealthAlert?: (data: HealthData) => void;
}

export function HealthMonitor({ userAddress, onHealthAlert }: HealthMonitorProps) {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(200);
  const [alertFrequency, setAlertFrequency] = useState(24);
  const [isMonitoringEnabled, setIsMonitoringEnabled] = useState(false);

  const fetchHealthData = async () => {
    setIsLoading(true);
    try {
      const mockData: HealthData = {
        healthFactor: Math.floor(Math.random() * 300) + 100, // 100-400%
        totalCollateralValue: Math.floor(Math.random() * 100000),
        totalBorrowedValue: Math.floor(Math.random() * 50000),
        isMonitoringEnabled: isMonitoringEnabled,
        alertThreshold: alertThreshold,
        lastHealthCheck: Date.now() / 1000,
        lastAlertSent: Math.random() > 0.5 ? Date.now() / 1000 - 3600 : 0,
        alertFrequencyHours: alertFrequency,
      };
      
      setHealthData(mockData);
      
      // Check if alert should be triggered
      if (mockData.healthFactor < mockData.alertThreshold && mockData.isMonitoringEnabled) {
        onHealthAlert?.(mockData);
      }
    } catch (error) {
      console.error('Failed to fetch health data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const enableMonitoring = async () => {
    setIsLoading(true);
    try {
      console.log('Enabling health monitoring...');
      setIsMonitoringEnabled(true);
      await fetchHealthData();
    } catch (error) {
      console.error('Failed to enable monitoring:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateThreshold = async () => {
    setIsLoading(true);
    try {
      console.log(`Updating threshold to ${alertThreshold}%, frequency to ${alertFrequency}h`);
      await fetchHealthData();
    } catch (error) {
      console.error('Failed to update threshold:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkHealthFactor = async () => {
    setIsLoading(true);
    try {
      console.log('Checking health factor...');
      await fetchHealthData();
    } catch (error) {
      console.error('Failed to check health factor:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createHealthSnapshot = async () => {
    setIsLoading(true);
    try {
      console.log('Creating health snapshot...');
      await fetchHealthData();
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
    const interval = setInterval(fetchHealthData, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getHealthStatus = (healthFactor: number) => {
    if (healthFactor >= 200) return { status: 'Excellent', color: 'text-green-600', bgColor: 'bg-green-100' };
    if (healthFactor >= 150) return { status: 'Good', color: 'text-blue-600', bgColor: 'bg-blue-100' };
    if (healthFactor >= 120) return { status: 'Caution', color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
    if (healthFactor >= 100) return { status: 'Warning', color: 'text-orange-600', bgColor: 'bg-orange-100' };
    return { status: 'Critical', color: 'text-red-600', bgColor: 'bg-red-100' };
  };

  const formatTimestamp = (timestamp: number) => {
    if (timestamp === 0) return 'Never';
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (!healthData) {
    return (
      <Card className="p-6">
        <Center>
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading health data...</p>
          </div>
        </Center>
      </Card>
    );
  }

  const healthStatus = getHealthStatus(healthData.healthFactor);

  return (
    <div className="space-y-6">
      {/* Health Status Overview */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Health Monitor</h2>
          <div className={`px-3 py-1 rounded-full ${healthStatus.bgColor}`}>
            <span className={`font-semibold ${healthStatus.color}`}>
              {healthStatus.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {healthData.healthFactor.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Health Factor</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-green-600">
              {formatCurrency(healthData.totalCollateralValue)}
            </div>
            <div className="text-sm text-gray-600">Total Collateral</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-red-600">
              {formatCurrency(healthData.totalBorrowedValue)}
            </div>
            <div className="text-sm text-gray-600">Total Borrowed</div>
          </div>
        </div>

        {/* Health Factor Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Health Factor</span>
            <span>{healthData.healthFactor.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-300 ${
                healthData.healthFactor >= 200 ? 'bg-green-500' :
                healthData.healthFactor >= 150 ? 'bg-blue-500' :
                healthData.healthFactor >= 120 ? 'bg-yellow-500' :
                healthData.healthFactor >= 100 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, (healthData.healthFactor / 300) * 100)}%` }}
            ></div>
          </div>
        </div>
      </Card>

      {/* Monitoring Controls */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Monitoring Controls</h3>
        
        <div className="space-y-4">
          {/* Enable/Disable Monitoring */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Health Monitoring</div>
              <div className="text-sm text-gray-600">
                {isMonitoringEnabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <Button
              onClick={enableMonitoring}
              disabled={isLoading || isMonitoringEnabled}
              className={isMonitoringEnabled ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {isMonitoringEnabled ? 'Enabled' : 'Enable Monitoring'}
            </Button>
          </div>

          {/* Alert Threshold Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Alert Threshold (%)
              </label>
              <TextInput
                type="number"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(Number(e.target.value))}
                min="110"
                max="300"
                placeholder="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Alert Frequency (hours)
              </label>
              <TextInput
                type="number"
                value={alertFrequency}
                onChange={(e) => setAlertFrequency(Number(e.target.value))}
                min="1"
                max="168"
                placeholder="24"
              />
            </div>
          </div>

          <Button
            onClick={updateThreshold}
            disabled={isLoading}
            className="w-full"
          >
            Update Settings
          </Button>
        </div>
      </Card>

      {/* Health Actions */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Health Actions</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            onClick={checkHealthFactor}
            disabled={isLoading}
            className="w-full"
          >
            Check Health Factor
          </Button>
          <Button
            onClick={createHealthSnapshot}
            disabled={isLoading}
            className="w-full"
          >
            Create Snapshot
          </Button>
        </div>
      </Card>

      {/* Health History */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Health History</h3>
        
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Last Health Check:</span>
            <span>{formatTimestamp(healthData.lastHealthCheck)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Last Alert Sent:</span>
            <span>{formatTimestamp(healthData.lastAlertSent)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Alert Frequency:</span>
            <span>{healthData.alertFrequencyHours} hours</span>
          </div>
        </div>
      </Card>

      {/* Risk Recommendations */}
      {healthData.healthFactor < 150 && (
        <Card className="p-6 border-orange-200 bg-orange-50">
          <h3 className="text-xl font-semibold text-orange-800 mb-4">⚠️ Risk Recommendations</h3>
          <div className="space-y-2 text-orange-700">
            {healthData.healthFactor < 120 && (
              <p>• Consider adding more collateral to improve your health factor</p>
            )}
            {healthData.healthFactor < 100 && (
              <p>• Your position is at risk of liquidation - repay debt immediately</p>
            )}
            <p>• Monitor your position closely and set up alerts</p>
            <p>• Consider reducing your borrowed amount</p>
          </div>
        </Card>
      )}
    </div>
  );
}
