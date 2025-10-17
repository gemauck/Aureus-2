// Health Score Tab Component for ClientDetailModal
// Add this as a new tab after 'contracts' in the tab list

/* ====== HEALTH SCORE TAB - ADD TO TAB ARRAY ====== */
// Update the tabs array to include 'health':
// ['overview', 'contacts', 'sites', 'opportunities', 'calendar', 'projects', 'contracts', 'health', 'activity', 'notes']

/* ====== HEALTH SCORE CALCULATION FUNCTION (Add after other handlers) ====== */

const calculateHealthScore = (clientData) => {
    let score = 0;
    const factors = [];

    // Factor 1: Communication Frequency (30 points)
    const lastContactDays = clientData.lastContact 
        ? Math.floor((new Date() - new Date(clientData.lastContact)) / (1000 * 60 * 60 * 24))
        : 999;
    
    let commScore = 0;
    let commStatus = '';
    if (lastContactDays <= 7) {
        commScore = 30;
        commStatus = 'Excellent';
    } else if (lastContactDays <= 30) {
        commScore = 20;
        commStatus = 'Good';
    } else if (lastContactDays <= 60) {
        commScore = 10;
        commStatus = 'Fair';
    } else {
        commScore = 0;
        commStatus = 'Poor';
    }
    score += commScore;
    factors.push({
        name: 'Communication',
        score: commScore,
        maxScore: 30,
        status: commStatus,
        detail: lastContactDays > 0 ? `Last contact ${lastContactDays} days ago` : 'No contact',
        icon: 'fa-comments'
    });

    // Factor 2: Active Projects (25 points)
    const projectCount = clientData.projectIds?.length || 0;
    let projectScore = Math.min(projectCount * 8, 25);
    let projectStatus = projectCount >= 3 ? 'Excellent' : projectCount >= 1 ? 'Good' : 'None';
    score += projectScore;
    factors.push({
        name: 'Projects',
        score: projectScore,
        maxScore: 25,
        status: projectStatus,
        detail: `${projectCount} active project${projectCount !== 1 ? 's' : ''}`,
        icon: 'fa-folder-open'
    });

    // Factor 3: Contract Status (20 points)
    const activeContracts = (clientData.contracts || []).filter(c => c.status === 'Active').length;
    const expiringContracts = (clientData.contracts || []).filter(c => {
        if (!c.endDate || c.status !== 'Active') return false;
        const daysUntil = Math.ceil((new Date(c.endDate) - new Date()) / (1000 * 60 * 60 * 24));
        return daysUntil > 0 && daysUntil <= 90;
    }).length;
    
    let contractScore = activeContracts > 0 ? 20 : 0;
    if (expiringContracts > 0) contractScore -= 5;
    contractScore = Math.max(contractScore, 0);
    
    let contractStatus = activeContracts > 0 ? (expiringContracts > 0 ? 'Warning' : 'Good') : 'None';
    score += contractScore;
    factors.push({
        name: 'Contracts',
        score: contractScore,
        maxScore: 20,
        status: contractStatus,
        detail: `${activeContracts} active${expiringContracts > 0 ? `, ${expiringContracts} expiring` : ''}`,
        icon: 'fa-file-contract'
    });

    // Factor 4: Engagement (15 points)
    const followUpCount = (clientData.followUps || []).length;
    const commentCount = (clientData.comments || []).length;
    const activityCount = (clientData.activityLog || []).length;
    
    const totalEngagement = followUpCount + commentCount + (activityCount > 5 ? 5 : activityCount);
    let engagementScore = Math.min(totalEngagement * 2, 15);
    let engagementStatus = totalEngagement >= 7 ? 'High' : totalEngagement >= 3 ? 'Medium' : 'Low';
    score += engagementScore;
    factors.push({
        name: 'Engagement',
        score: engagementScore,
        maxScore: 15,
        status: engagementStatus,
        detail: `${activityCount} activities, ${followUpCount} follow-ups`,
        icon: 'fa-chart-line'
    });

    // Factor 5: Sites (10 points)
    const siteCount = clientData.sites?.length || 0;
    let siteScore = Math.min(siteCount * 3, 10);
    let siteStatus = siteCount >= 3 ? 'Multiple' : siteCount >= 1 ? 'Single' : 'None';
    score += siteScore;
    factors.push({
        name: 'Sites',
        score: siteScore,
        maxScore: 10,
        status: siteStatus,
        detail: `${siteCount} site${siteCount !== 1 ? 's' : ''}`,
        icon: 'fa-map-marker-alt'
    });

    // Determine grade
    let grade = '';
    let gradeColor = '';
    if (score >= 85) {
        grade = 'A - Excellent';
        gradeColor = 'text-green-700 bg-green-100 border-green-300';
    } else if (score >= 70) {
        grade = 'B - Good';
        gradeColor = 'text-blue-700 bg-blue-100 border-blue-300';
    } else if (score >= 50) {
        grade = 'C - Fair';
        gradeColor = 'text-yellow-700 bg-yellow-100 border-yellow-300';
    } else if (score >= 30) {
        grade = 'D - At Risk';
        gradeColor = 'text-orange-700 bg-orange-100 border-orange-300';
    } else {
        grade = 'F - Critical';
        gradeColor = 'text-red-700 bg-red-100 border-red-300';
    }

    return { score, grade, gradeColor, factors };
};

/* ====== HEALTH SCORE TAB JSX (Add as new tab content) ====== */

{activeTab === 'health' && (() => {
    const healthData = calculateHealthScore(formData);
    const { score, grade, gradeColor, factors } = healthData;

    const getScoreColor = (score, maxScore) => {
        const percentage = (score / maxScore) * 100;
        if (percentage >= 80) return 'bg-green-500';
        if (percentage >= 60) return 'bg-blue-500';
        if (percentage >= 40) return 'bg-yellow-500';
        if (percentage >= 20) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const getStatusColor = (status) => {
        const colors = {
            'Excellent': 'text-green-700 bg-green-100',
            'Good': 'text-blue-700 bg-blue-100',
            'Fair': 'text-yellow-700 bg-yellow-100',
            'Warning': 'text-orange-700 bg-orange-100',
            'Poor': 'text-red-700 bg-red-100',
            'None': 'text-gray-700 bg-gray-100',
            'High': 'text-green-700 bg-green-100',
            'Medium': 'text-yellow-700 bg-yellow-100',
            'Low': 'text-red-700 bg-red-100',
            'Multiple': 'text-blue-700 bg-blue-100',
            'Single': 'text-gray-700 bg-gray-100'
        };
        return colors[status] || 'text-gray-700 bg-gray-100';
    };

    return (
        <div className="space-y-4">
            {/* Overall Score Card */}
            <div className={`rounded-lg p-6 border-2 ${
                score >= 85 ? 'bg-green-50 border-green-300' :
                score >= 70 ? 'bg-blue-50 border-blue-300' :
                score >= 50 ? 'bg-yellow-50 border-yellow-300' :
                score >= 30 ? 'bg-orange-50 border-orange-300' :
                'bg-red-50 border-red-300'
            }`}>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">Client Health Score</h3>
                        <p className="text-xs text-gray-600">
                            Based on 5 key factors: communication, projects, contracts, engagement, and sites
                        </p>
                    </div>
                    <div className="text-center">
                        <div className={`text-5xl font-bold ${
                            score >= 85 ? 'text-green-700' :
                            score >= 70 ? 'text-blue-700' :
                            score >= 50 ? 'text-yellow-700' :
                            score >= 30 ? 'text-orange-700' :
                            'text-red-700'
                        }`}>
                            {score}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">out of 100</div>
                    </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mt-4">
                    <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                            className={`h-3 rounded-full transition-all duration-500 ${
                                score >= 85 ? 'bg-green-500' :
                                score >= 70 ? 'bg-blue-500' :
                                score >= 50 ? 'bg-yellow-500' :
                                score >= 30 ? 'bg-orange-500' :
                                'bg-red-500'
                            }`}
                            style={{ width: `${score}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>Critical</span>
                        <span>At Risk</span>
                        <span>Fair</span>
                        <span>Good</span>
                        <span>Excellent</span>
                    </div>
                </div>

                {/* Grade Badge */}
                <div className="mt-4 flex items-center justify-center">
                    <span className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 border ${gradeColor}`}>
                        <i className={`fas ${
                            score >= 85 ? 'fa-star' :
                            score >= 70 ? 'fa-thumbs-up' :
                            score >= 50 ? 'fa-exclamation-triangle' :
                            score >= 30 ? 'fa-exclamation-circle' :
                            'fa-times-circle'
                        }`}></i>
                        {grade}
                    </span>
                </div>
            </div>

            {/* Recommendations */}
            {score < 70 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                        <i className="fas fa-lightbulb text-blue-600 mt-0.5"></i>
                        <div>
                            <h4 className="text-sm font-semibold text-blue-900 mb-2">Recommendations</h4>
                            <ul className="text-xs text-blue-800 space-y-1">
                                {score < 30 && (
                                    <>
                                        <li>• Schedule immediate check-in call</li>
                                        <li>• Review and update contract status</li>
                                        <li>• Identify and address concerns</li>
                                    </>
                                )}
                                {score >= 30 && score < 50 && (
                                    <>
                                        <li>• Increase communication frequency</li>
                                        <li>• Schedule quarterly business review</li>
                                        <li>• Explore expansion opportunities</li>
                                    </>
                                )}
                                {score >= 50 && score < 70 && (
                                    <>
                                        <li>• Maintain regular touchpoints</li>
                                        <li>• Review project performance</li>
                                        <li>• Seek feedback and testimonials</li>
                                    </>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Factor Breakdown */}
            <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Score Breakdown</h4>
                <div className="space-y-3">
                    {factors.map((factor, index) => (
                        <div key={index} className="bg-white border border-gray-200 rounded-lg p-3">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <i className={`fas ${factor.icon} text-primary-600`}></i>
                                    <div>
                                        <div className="text-xs font-semibold text-gray-900">{factor.name}</div>
                                        <div className="text-xs text-gray-600">{factor.detail}</div>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(factor.status)}`}>
                                    {factor.status}
                                </span>
                            </div>
                            
                            {/* Score Bar */}
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className={`h-2 rounded-full ${getScoreColor(factor.score, factor.maxScore)}`}
                                            style={{ width: `${(factor.score / factor.maxScore) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <span className="text-xs font-semibold text-gray-700 min-w-[60px] text-right">
                                    {factor.score}/{factor.maxScore}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <i className="fas fa-clipboard-list text-primary-600"></i>
                    Quick Actions to Improve Score
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    {factors
                        .filter(f => (f.score / f.maxScore) < 0.6)
                        .map((factor, index) => (
                            <button
                                key={index}
                                type="button"
                                onClick={() => {
                                    // Navigate to appropriate tab based on factor
                                    if (factor.name === 'Communication') setActiveTab('calendar');
                                    else if (factor.name === 'Projects') setActiveTab('projects');
                                    else if (factor.name === 'Contracts') setActiveTab('contracts');
                                    else if (factor.name === 'Engagement') setActiveTab('activity');
                                    else if (factor.name === 'Sites') setActiveTab('sites');
                                }}
                                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-left"
                            >
                                <i className={`fas ${factor.icon} text-primary-600 text-xs`}></i>
                                <span className="text-xs text-gray-700">
                                    Improve {factor.name}
                                </span>
                            </button>
                        ))}
                    {factors.filter(f => (f.score / f.maxScore) < 0.6).length === 0 && (
                        <div className="col-span-2 text-center text-xs text-gray-600 py-2">
                            All factors performing well! Keep up the good work.
                        </div>
                    )}
                </div>
            </div>

            {/* Info Box */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <i className="fas fa-chart-area text-primary-600"></i>
                    How Health Score Works
                </h4>
                <div className="space-y-2 text-xs text-gray-600">
                    <div><strong>Communication (30pts):</strong> Recent contact frequency</div>
                    <div><strong>Projects (25pts):</strong> Number of active projects</div>
                    <div><strong>Contracts (20pts):</strong> Active contracts and expiry status</div>
                    <div><strong>Engagement (15pts):</strong> Follow-ups, comments, and activities</div>
                    <div><strong>Sites (10pts):</strong> Number of tracked locations</div>
                </div>
            </div>
        </div>
    );
})()}
