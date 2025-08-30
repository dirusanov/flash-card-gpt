/**
 * Dynamic API Request Tracker
 * Automatically tracks all API requests and provides real-time progress updates
 */

import { DetailedLoadingMessage } from './loadingMessages';

export interface ApiRequest {
  id: string;
  operation: string;
  description: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  icon?: string;
  color?: string;
}

export interface ProgressUpdate {
  completed: number;
  total: number;
  currentRequest?: ApiRequest;
  progress: number;
  message: DetailedLoadingMessage;
}

export class ApiRequestTracker {
  private requests: Map<string, ApiRequest> = new Map();
  private activeRequests: Set<string> = new Set();
  private onProgressUpdate?: (update: ProgressUpdate) => void;
  private requestCounter = 0;
  private startTime = Date.now();

  constructor(onProgressUpdate?: (update: ProgressUpdate) => void) {
    this.onProgressUpdate = onProgressUpdate;
  }

  /**
   * Start tracking a new API request
   */
  startRequest(operation: string, description: string, icon?: string, color?: string): string {
    const id = `request_${++this.requestCounter}_${Date.now()}`;

    const request: ApiRequest = {
      id,
      operation,
      description,
      startTime: Date.now(),
      status: 'pending',
      icon,
      color: color || this.getDefaultColor(operation)
    };

    this.requests.set(id, request);
    this.activeRequests.add(id);



    // Update progress
    this.notifyProgressUpdate();

    return id;
  }

  /**
   * Mark request as in progress
   */
  setInProgress(requestId: string): void {
    const request = this.requests.get(requestId);
    if (request) {
      request.status = 'in-progress';

      this.notifyProgressUpdate();
    }
  }

  /**
   * Mark request as completed
   */
  completeRequest(requestId: string): void {
    const request = this.requests.get(requestId);
    if (request) {
      request.status = 'completed';
      request.endTime = Date.now();
      this.activeRequests.delete(requestId);

      this.notifyProgressUpdate();
    }
  }

  /**
   * Mark request as error
   */
  errorRequest(requestId: string): void {
    const request = this.requests.get(requestId);
    if (request) {
      request.status = 'error';
      request.endTime = Date.now();
      this.activeRequests.delete(requestId);

      this.notifyProgressUpdate();
    }
  }

  /**
   * Get current progress information
   */
  getCurrentProgress(): ProgressUpdate {
    const allRequests = Array.from(this.requests.values());
    const completedRequests = allRequests.filter(r => r.status === 'completed' || r.status === 'error').length;
    const totalRequests = allRequests.length;
    const currentRequest = Array.from(this.activeRequests)
      .map(id => this.requests.get(id))
      .find(r => r?.status === 'in-progress');

    const progress = totalRequests > 0 ? (completedRequests / totalRequests) * 100 : 0;

    let message: DetailedLoadingMessage;

    if (currentRequest) {
      message = {
        title: currentRequest.operation,
        subtitle: currentRequest.description,
        icon: currentRequest.icon,
        color: currentRequest.color,
        currentStep: completedRequests + 1,
        totalSteps: totalRequests,
        currentStepTitle: currentRequest.operation,
        currentStepSubtitle: currentRequest.description
      };
    } else if (totalRequests === 0) {
      message = {
        title: 'Ready',
        subtitle: 'No active requests',
        icon: '✅',
        color: '#10B981'
      };
    } else if (completedRequests === totalRequests && totalRequests > 0) {
      message = {
        title: 'Completed!',
        subtitle: `All ${totalRequests} requests finished`,
        icon: '✅',
        color: '#10B981',
        currentStep: completedRequests,
        totalSteps: totalRequests,
        currentStepTitle: 'Completed!',
        currentStepSubtitle: `All ${totalRequests} requests finished`
      };
    } else {
      message = {
        title: 'Processing...',
        subtitle: `${completedRequests} of ${totalRequests} requests completed`,
        icon: '⚡',
        color: '#3B82F6',
        currentStep: completedRequests,
        totalSteps: totalRequests,
        currentStepTitle: 'Processing...',
        currentStepSubtitle: `${completedRequests} of ${totalRequests} requests completed`
      };
    }

    return {
      completed: completedRequests,
      total: totalRequests,
      currentRequest,
      progress,
      message
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    const all = Array.from(this.requests.values());
    return {
      total: all.length,
      completed: all.filter(r => r.status === 'completed').length,
      pending: all.filter(r => r.status === 'pending').length,
      inProgress: all.filter(r => r.status === 'in-progress').length,
      errors: all.filter(r => r.status === 'error').length,
      elapsedTime: Date.now() - this.startTime
    };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.requests.clear();
    this.activeRequests.clear();
    this.requestCounter = 0;
    this.startTime = Date.now();
    this.notifyProgressUpdate();
  }

  /**
   * Get default color for operation type
   */
  private getDefaultColor(operation: string): string {
    const colorMap: Record<string, string> = {
      'translate': '#3B82F6',
      'generate-examples': '#F59E0B',
      'analyze-word': '#8B5CF6',
      'create-image-description': '#EC4899',
      'generate-image': '#6366F1',
      'create-card': '#10B981',
      'save-card': '#EF4444',
      'connect': '#6366F1'
    };

    // Find matching operation
    for (const [key, color] of Object.entries(colorMap)) {
      if (operation.toLowerCase().includes(key)) {
        return color;
      }
    }

    return '#6B7280'; // Default gray
  }

  /**
   * Get icon for operation type
   */
  private getDefaultIcon(operation: string): string {
    const iconMap: Record<string, string> = {
      'translate': '🌍',
      'generate-examples': '💡',
      'analyze-word': '🔍',
      'create-image-description': '🎨',
      'generate-image': '🖼️',
      'create-card': '🧠',
      'save-card': '💾',
      'connect': '🔗'
    };

    // Find matching operation
    for (const [key, icon] of Object.entries(iconMap)) {
      if (operation.toLowerCase().includes(key)) {
        return icon;
      }
    }

    return '⚡'; // Default lightning
  }

  /**
   * Notify listeners about progress update
   */
  private notifyProgressUpdate(): void {
    if (this.onProgressUpdate) {
      const progress = this.getCurrentProgress();
      


      this.onProgressUpdate(progress);
    }
  }
}

// Global instance
let globalApiTracker: ApiRequestTracker | null = null;

/**
 * Get or create global API tracker instance
 */
export const getGlobalApiTracker = (): ApiRequestTracker => {
  if (!globalApiTracker) {
    globalApiTracker = new ApiRequestTracker();
  }
  return globalApiTracker;
};

/**
 * Set global progress update callback
 */
export const setGlobalProgressCallback = (callback: (update: ProgressUpdate) => void): void => {
  // Get existing tracker or create new one
  const tracker = getGlobalApiTracker();
  // Set the callback directly instead of creating a new tracker
  (tracker as any).onProgressUpdate = callback;
};

/**
 * Helper functions for common operations
 */
export const trackApiRequest = {
  translate: (description: string) =>
    getGlobalApiTracker().startRequest('translate', description, '🌍', '#3B82F6'),

  generateExamples: (description: string) =>
    getGlobalApiTracker().startRequest('generate-examples', description, '💡', '#F59E0B'),

  analyzeWord: (description: string) =>
    getGlobalApiTracker().startRequest('analyze-word', description, '🔍', '#8B5CF6'),

  createImageDescription: (description: string) =>
    getGlobalApiTracker().startRequest('create-image-description', description, '🎨', '#EC4899'),

  generateImage: (description: string) =>
    getGlobalApiTracker().startRequest('generate-image', description, '🖼️', '#6366F1'),

  createCard: (description: string) =>
    getGlobalApiTracker().startRequest('create-card', description, '🧠', '#10B981'),

  saveCard: (description: string) =>
    getGlobalApiTracker().startRequest('save-card', description, '💾', '#EF4444'),

  connect: (description: string) =>
    getGlobalApiTracker().startRequest('connect', description, '🔗', '#6366F1')
};
