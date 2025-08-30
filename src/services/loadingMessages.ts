/**
 * Service for managing beautiful loading messages in English
 * Provides contextual messages for different API operations with smooth UX
 */

export interface LoadingMessage {
  title: string;
  subtitle: string;
  icon?: string;
  color?: string;
  steps?: Array<{
    title: string;
    subtitle: string;
  }>;
}

export interface DetailedLoadingMessage extends LoadingMessage {
  currentStep?: number;
  totalSteps?: number;
  currentStepTitle?: string;
  currentStepSubtitle?: string;
}

// Loading messages for different API operations with detailed progress tracking
export const LOADING_MESSAGES = {
  // Translation operations
  TRANSLATING_TEXT: {
    title: 'Translating text...',
    subtitle: 'Converting your text to the target language',
    icon: '🌍',
    color: '#3B82F6',
    steps: [
      { title: 'Preparing translation...', subtitle: 'Setting up translation parameters' },
      { title: 'Sending to translation AI...', subtitle: 'Communicating with OpenAI servers' },
      { title: 'Processing translation...', subtitle: 'AI is analyzing and translating your text' },
      { title: 'Finalizing translation...', subtitle: 'Applying final touches to the translation' }
    ]
  },
  TRANSLATING_EXAMPLES: {
    title: 'Translating examples...',
    subtitle: 'Making example sentences available in your language',
    icon: '📝',
    color: '#10B981',
    steps: [
      { title: 'Preparing examples...', subtitle: 'Organizing example sentences for translation' },
      { title: 'Translating examples...', subtitle: 'Converting examples to your target language' },
      { title: 'Processing translations...', subtitle: 'Ensuring translation quality and accuracy' }
    ]
  },

  // Examples generation
  GENERATING_EXAMPLES: {
    title: 'Generating examples...',
    subtitle: 'Creating meaningful example sentences for better understanding',
    icon: '💡',
    color: '#F59E0B',
    steps: [
      { title: 'Analyzing word context...', subtitle: 'Understanding word usage and meaning' },
      { title: 'Creating example prompts...', subtitle: 'Preparing AI prompts for example generation' },
      { title: 'Generating examples...', subtitle: 'AI is crafting relevant example sentences' },
      { title: 'Refining examples...', subtitle: 'Ensuring examples are clear and educational' }
    ]
  },

  // Image operations
  ANALYZING_WORD_FOR_IMAGE: {
    title: 'Analyzing word...',
    subtitle: 'Determining if this is a concept or object for optimal visualization',
    icon: '🔍',
    color: '#8B5CF6',
    steps: [
      { title: 'Classifying word type...', subtitle: 'Determining if word represents concept or object' },
      { title: 'Evaluating visual potential...', subtitle: 'Assessing how well this can be visualized' },
      { title: 'Preparing visualization strategy...', subtitle: 'Choosing optimal image generation approach' }
    ]
  },
  CREATING_IMAGE_DESCRIPTION: {
    title: 'Creating image description...',
    subtitle: 'Crafting detailed prompts for AI image generation',
    icon: '🎨',
    color: '#EC4899',
    steps: [
      { title: 'Building image prompt...', subtitle: 'Creating detailed description for image generation' },
      { title: 'Optimizing prompt...', subtitle: 'Refining prompt for best AI image results' },
      { title: 'Finalizing description...', subtitle: 'Preparing final prompt for image generation' }
    ]
  },
  GENERATING_IMAGE: {
    title: 'Generating image...',
    subtitle: 'AI is creating a beautiful illustration just for you',
    icon: '🖼️',
    color: '#6366F1',
    steps: [
      { title: 'Sending to image AI...', subtitle: 'Transmitting prompt to OpenAI DALL-E' },
      { title: 'AI generating image...', subtitle: 'Neural network is creating your custom illustration' },
      { title: 'Processing image...', subtitle: 'Applying final touches and optimizations' },
      { title: 'Preparing image for display...', subtitle: 'Finalizing image for your flashcard' }
    ]
  },

  // Card generation
  GENERATING_CARD_CONTENT: {
    title: 'Generating card content...',
    subtitle: 'AI is analyzing your text and creating the perfect flashcard',
    icon: '🧠',
    color: '#3B82F6',
    steps: [
      { title: 'Analyzing input text...', subtitle: 'Understanding the content and context' },
      { title: 'Extracting key information...', subtitle: 'Identifying main concepts and details' },
      { title: 'Structuring card content...', subtitle: 'Organizing information for optimal learning' },
      { title: 'Generating front side...', subtitle: 'Creating effective question or prompt' },
      { title: 'Generating back side...', subtitle: 'Developing comprehensive answer or explanation' },
      { title: 'Finalizing card format...', subtitle: 'Ensuring proper flashcard structure' }
    ]
  },
  GENERATING_FRONT_SIDE: {
    title: 'Creating front side...',
    subtitle: 'Crafting an effective question or prompt',
    icon: '❓',
    color: '#10B981',
    steps: [
      { title: 'Designing question format...', subtitle: 'Choosing optimal question structure' },
      { title: 'Crafting question text...', subtitle: 'Writing clear and effective question' },
      { title: 'Optimizing for learning...', subtitle: 'Ensuring question promotes active recall' }
    ]
  },
  GENERATING_BACK_SIDE: {
    title: 'Creating back side...',
    subtitle: 'Developing comprehensive answers and explanations',
    icon: '📖',
    color: '#F59E0B',
    steps: [
      { title: 'Compiling answer content...', subtitle: 'Gathering comprehensive information' },
      { title: 'Structuring explanation...', subtitle: 'Organizing answer for clarity' },
      { title: 'Adding learning elements...', subtitle: 'Including helpful context and examples' }
    ]
  },

  // Anki operations
  SAVING_TO_ANKI: {
    title: 'Saving to Anki...',
    subtitle: 'Your card is being added to your Anki collection',
    icon: '💾',
    color: '#EF4444',
    steps: [
      { title: 'Connecting to Anki...', subtitle: 'Establishing connection with Anki application' },
      { title: 'Validating card data...', subtitle: 'Ensuring card format is correct' },
      { title: 'Saving to collection...', subtitle: 'Adding card to your Anki deck' },
      { title: 'Confirming save...', subtitle: 'Verifying card was saved successfully' }
    ]
  },
  CONNECTING_TO_ANKI: {
    title: 'Connecting to Anki...',
    subtitle: 'Establishing connection with your Anki application',
    icon: '🔗',
    color: '#6366F1',
    steps: [
      { title: 'Locating Anki application...', subtitle: 'Finding Anki on your system' },
      { title: 'Establishing connection...', subtitle: 'Setting up communication with Anki' },
      { title: 'Verifying connection...', subtitle: 'Ensuring stable connection is established' }
    ]
  },

  // Language detection
  DETECTING_LANGUAGE: {
    title: 'Detecting language...',
    subtitle: 'Analyzing text to determine the source language',
    icon: '🔤',
    color: '#8B5CF6',
    steps: [
      { title: 'Analyzing text patterns...', subtitle: 'Examining linguistic characteristics' },
      { title: 'Identifying language...', subtitle: 'Determining the most likely language' },
      { title: 'Confirming detection...', subtitle: 'Validating language identification' }
    ]
  },

  // General states
  PROCESSING_REQUEST: {
    title: 'Processing your request...',
    subtitle: 'Please wait while we work our magic',
    icon: '⚡',
    color: '#6B7280',
    steps: [
      { title: 'Initializing request...', subtitle: 'Setting up your request parameters' },
      { title: 'Processing...', subtitle: 'Working on your request' },
      { title: 'Almost done...', subtitle: 'Finalizing your request' }
    ]
  },
  FINALIZING: {
    title: 'Finalizing...',
    subtitle: 'Putting everything together nicely',
    icon: '✨',
    color: '#10B981',
    steps: [
      { title: 'Assembling results...', subtitle: 'Combining all processed information' },
      { title: 'Applying final touches...', subtitle: 'Making everything look perfect' },
      { title: 'Ready!', subtitle: 'Your request has been completed successfully' }
    ]
  }
};

/**
 * Get loading message for specific operation type
 */
export const getLoadingMessage = (operation: keyof typeof LOADING_MESSAGES): LoadingMessage => {
  return LOADING_MESSAGES[operation];
};

/**
 * Get detailed loading message with current step information
 */
export const getDetailedLoadingMessage = (
  operation: keyof typeof LOADING_MESSAGES,
  currentStep?: number
): DetailedLoadingMessage => {
  const baseMessage = LOADING_MESSAGES[operation];
  const steps = baseMessage.steps || [];

  if (!currentStep || currentStep <= 0) {
    return {
      ...baseMessage,
      currentStep: 0,
      totalSteps: steps.length,
      currentStepTitle: baseMessage.title,
      currentStepSubtitle: baseMessage.subtitle
    };
  }

  const stepIndex = Math.min(currentStep - 1, steps.length - 1);
  const currentStepData = steps[stepIndex];

  return {
    ...baseMessage,
    currentStep,
    totalSteps: steps.length,
    currentStepTitle: currentStepData?.title || baseMessage.title,
    currentStepSubtitle: currentStepData?.subtitle || baseMessage.subtitle
  };
};

/**
 * Get next step message for progressive loading
 */
export const getNextStepMessage = (
  operation: keyof typeof LOADING_MESSAGES,
  currentStep: number
): DetailedLoadingMessage | null => {
  const baseMessage = LOADING_MESSAGES[operation];
  const steps = baseMessage.steps || [];

  if (currentStep >= steps.length) {
    return null; // No more steps
  }

  return getDetailedLoadingMessage(operation, currentStep + 1);
};

/**
 * Get sequential messages for multi-step operations
 */
export const getSequentialMessages = (operations: (keyof typeof LOADING_MESSAGES)[]): LoadingMessage[] => {
  return operations.map(op => LOADING_MESSAGES[op]);
};

/**
 * Get all steps for an operation as individual messages
 */
export const getOperationSteps = (operation: keyof typeof LOADING_MESSAGES): LoadingMessage[] => {
  const baseMessage = LOADING_MESSAGES[operation];
  const steps = baseMessage.steps || [];

  return steps.map(step => ({
    title: step.title,
    subtitle: step.subtitle,
    icon: baseMessage.icon,
    color: baseMessage.color,
    steps: undefined // Remove steps for individual step messages
  }));
};

/**
 * Get random encouraging message for long operations
 */
export const getEncouragingMessage = (): string => {
  const messages = [
    "Almost there...",
    "Working on it...",
    "Just a moment...",
    "Processing...",
    "Getting things ready...",
    "Finishing up..."
  ];
  return messages[Math.floor(Math.random() * messages.length)];
};

/**
 * Get time-based messages for operations that might take longer
 */
export const getTimeBasedMessages = (elapsedSeconds: number): string => {
  if (elapsedSeconds < 3) {
    return "Starting up...";
  } else if (elapsedSeconds < 8) {
    return "Processing your request...";
  } else if (elapsedSeconds < 15) {
    return "This is taking a bit longer, but we're getting there...";
  } else {
    return "Still working... Thank you for your patience!";
  }
};

/**
 * Create a loading progress tracker for complex operations
 *
 * Example usage:
 * ```typescript
 * const tracker = new LoadingProgressTracker('GENERATING_CARD_CONTENT', (message) => {
 *   console.log(`Step ${message.currentStep}/${message.totalSteps}: ${message.currentStepTitle}`);
 * });
 *
 * // Move through steps
 * tracker.nextStep(); // Step 1: Analyzing input text...
 * tracker.nextStep(); // Step 2: Extracting key information...
 * // ... and so on
 * ```
 */
export class LoadingProgressTracker {
  private operation: keyof typeof LOADING_MESSAGES;
  private currentStep: number = 0;
  private onProgressUpdate?: (message: DetailedLoadingMessage) => void;
  private startTime: number = Date.now();

  constructor(
    operation: keyof typeof LOADING_MESSAGES,
    onProgressUpdate?: (message: DetailedLoadingMessage) => void
  ) {
    this.operation = operation;
    this.onProgressUpdate = onProgressUpdate;
    this.startTime = Date.now();
  }

  /**
   * Move to next step and notify listeners
   */
  nextStep(): DetailedLoadingMessage | null {
    this.currentStep++;
    const message = getDetailedLoadingMessage(this.operation, this.currentStep);

    if (this.onProgressUpdate && message) {
      this.onProgressUpdate(message);
    }

    return message;
  }

  /**
   * Set specific step
   */
  setStep(step: number): DetailedLoadingMessage | null {
    this.currentStep = step;
    const message = getDetailedLoadingMessage(this.operation, this.currentStep);

    if (this.onProgressUpdate && message) {
      this.onProgressUpdate(message);
    }

    return message;
  }

  /**
   * Get current progress information
   */
  getCurrentProgress(): DetailedLoadingMessage {
    return getDetailedLoadingMessage(this.operation, this.currentStep);
  }

  /**
   * Get elapsed time in seconds
   */
  getElapsedTime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Check if operation is complete
   */
  isComplete(): boolean {
    const steps = LOADING_MESSAGES[this.operation].steps || [];
    return this.currentStep >= steps.length;
  }

  /**
   * Reset tracker to initial state
   */
  reset(): void {
    this.currentStep = 0;
    this.startTime = Date.now();
  }
}
