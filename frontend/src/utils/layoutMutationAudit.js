/**
 * LAYOUT MUTATION AUDIT SYSTEM
 * Evidence-driven detection of post-load layout mutations
 * 
 * CRITICAL: This detects ALL sources of layout shift:
 * - Style attribute mutations
 * - Class name changes
 * - DOM structure changes
 * - Component re-mounts
 * - API-driven re-renders
 */

let mutationObserver = null;
let layoutShiftLog = [];

const classNameOf = (node) => {
    if (!node) return '';
    if (typeof node.className === 'string') return node.className;
    return node.className?.baseVal || '';
};

const isExpectedLiveStyleMutation = (target) => {
    const className = classNameOf(target);
    return className.includes('progress-bar-segment');
};

const isTextOnlyChildList = (mutation) => {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.length > 0 && nodes.every((node) => (
        node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE
    ));
};

/**
 * Detect style mutations
 */
const detectStyleMutation = (mutation) => {
    const target = mutation.target;
    if (isExpectedLiveStyleMutation(target)) return;

    const oldValue = mutation.oldValue;
    const newValue = target.getAttribute('style');
    
    if (oldValue !== newValue) {
        const logEntry = {
            type: 'STYLE_MUTATION',
            element: classNameOf(target) || target.tagName,
            oldValue,
            newValue,
            timestamp: Date.now()
        };
        
        layoutShiftLog.push(logEntry);
        console.error('🚨 STYLE MUTATION DETECTED:', logEntry);
        console.log('Element:', target);
        console.trace('Mutation stack trace:');
    }
};

/**
 * Detect class mutations
 */
const detectClassMutation = (mutation) => {
    const target = mutation.target;
    const oldValue = mutation.oldValue;
    const newValue = target.className;
    
    if (oldValue !== newValue) {
        const logEntry = {
            type: 'CLASS_MUTATION',
            element: target.tagName,
            oldValue,
            newValue,
            timestamp: Date.now()
        };
        
        layoutShiftLog.push(logEntry);
        console.error('🚨 CLASS MUTATION DETECTED:', logEntry);
        console.log('Element:', target);
    }
};

/**
 * Detect DOM structure mutations
 */
const detectDOMMutation = (mutation) => {
    if (isTextOnlyChildList(mutation)) return;
    if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
        const logEntry = {
            type: 'DOM_MUTATION',
            target: classNameOf(mutation.target) || mutation.target.tagName,
            added: mutation.addedNodes.length,
            removed: mutation.removedNodes.length,
            timestamp: Date.now()
        };
        
        layoutShiftLog.push(logEntry);
        console.error('🚨 DOM STRUCTURE MUTATION:', logEntry);
        console.log('Target:', mutation.target);
    }
};

/**
 * Start layout mutation audit
 */
export const auditLayoutMutations = () => {
    console.log('🔍 LAYOUT MUTATION AUDIT STARTED');
    console.log('⏱️  Monitoring for 10 seconds...');
    console.log('ℹ️  Ignoring live progress-bar width and text-only clock updates.');
    console.log('');
    
    // Reset logs
    layoutShiftLog = [];
    
    // Create mutation observer
    mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            // Detect style mutations
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                detectStyleMutation(mutation);
            }
            
            // Detect class mutations
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                detectClassMutation(mutation);
            }
            
            // Detect DOM structure mutations
            if (mutation.type === 'childList') {
                detectDOMMutation(mutation);
            }
        });
    });
    
    // Start observing
    mutationObserver.observe(document.body, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        subtree: true
    });
    
    // Stop after 10 seconds and generate report
    setTimeout(() => {
        stopAudit();
        generateReport();
    }, 10000);
};

/**
 * Stop audit
 */
const stopAudit = () => {
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
};

const generateReport = () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 LAYOUT MUTATION AUDIT REPORT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    console.log('🚨 LAYOUT MUTATIONS:');
    if (layoutShiftLog.length === 0) {
        console.log('   ✅ No layout mutations detected');
    } else {
        const styleMutations = layoutShiftLog.filter(l => l.type === 'STYLE_MUTATION');
        const classMutations = layoutShiftLog.filter(l => l.type === 'CLASS_MUTATION');
        const domMutations = layoutShiftLog.filter(l => l.type === 'DOM_MUTATION');
        
        console.error(`   ❌ Style mutations: ${styleMutations.length}`);
        console.error(`   ❌ Class mutations: ${classMutations.length}`);
        console.error(`   ❌ DOM mutations: ${domMutations.length}`);
        console.log('');
        console.log('   Detailed log:');
        layoutShiftLog.forEach((log, index) => {
            console.error(`   ${index + 1}. ${log.type}:`, log);
        });
    }
    console.log('');
    
    const totalIssues = layoutShiftLog.length;
    
    if (totalIssues === 0) {
        console.log('✅ AUDIT PASSED: NO MUTATIONS DETECTED');
    } else {
        console.error(`❌ AUDIT FAILED: ${totalIssues} ISSUES DETECTED`);
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    return {
        layoutShiftLog,
        totalIssues
    };
};

const getAuditData = () => {
    return {
        layoutShiftLog
    };
};

// Export to window for console access
if (typeof window !== 'undefined') {
    window.auditLayoutMutations = auditLayoutMutations;
    window.stopAudit = stopAudit;
    window.generateReport = generateReport;
    window.getAuditData = getAuditData;
}

