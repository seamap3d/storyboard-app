// --- Schedule Management Functions ---

function initScheduleTools() {
  const btnScheduleTools = document.getElementById('btnScheduleTools');
  const btnCloseScheduleTools = document.getElementById('btnCloseScheduleTools');
  const scheduleToolsPanel = document.getElementById('scheduleToolsPanel');
  const btnApplyToSelected = document.getElementById('btnApplyToSelected');
  const btnApplyToUnscheduled = document.getElementById('btnApplyToUnscheduled');
  const btnGroupByLocation = document.getElementById('btnGroupByLocation');
  const btnAutoSchedule = document.getElementById('btnAutoSchedule');
  const btnDistributeDays = document.getElementById('btnDistributeDays');
  
  if (!btnScheduleTools) return;

  // Toggle schedule tools panel
  btnScheduleTools.addEventListener('click', () => {
    scheduleToolsPanel.classList.toggle('hidden');
  });

  btnCloseScheduleTools?.addEventListener('click', () => {
    scheduleToolsPanel.classList.add('hidden');
  });

  // Bulk date assignment to selected shots
  btnApplyToSelected?.addEventListener('click', () => {
    const bulkDate = document.getElementById('bulkDate')?.value;
    const bulkCallTime = document.getElementById('bulkCallTime')?.value;
    
    if (!bulkDate) {
      alert('Please select a date first');
      return;
    }

    const selectedShots = getSelectedShotLis();
    if (selectedShots.length === 0) {
      alert('Please select some shots first');
      return;
    }

    selectedShots.forEach(li => {
      const shootDateInput = li.querySelector('.shootdate');
      if (shootDateInput) {
        shootDateInput.value = bulkDate;
        // Trigger change event to save
        shootDateInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    persistFromDOM();
    alert(`Applied ${bulkDate} to ${selectedShots.length} shots`);
  });

  // Apply to all unscheduled shots
  btnApplyToUnscheduled?.addEventListener('click', () => {
    const bulkDate = document.getElementById('bulkDate')?.value;
    
    if (!bulkDate) {
      alert('Please select a date first');
      return;
    }

    let count = 0;
    Array.from(shotList.children).forEach(li => {
      const shootDateInput = li.querySelector('.shootdate');
      if (shootDateInput && !shootDateInput.value) {
        shootDateInput.value = bulkDate;
        shootDateInput.dispatchEvent(new Event('input', { bubbles: true }));
        count++;
      }
    });

    persistFromDOM();
    alert(`Applied ${bulkDate} to ${count} unscheduled shots`);
  });

  // Smart grouping by location
  btnGroupByLocation?.addEventListener('click', () => {
    const locationGroups = {};
    
    // Group shots by location
    state.shots.forEach(shot => {
      const location = shot.location || 'Unknown Location';
      if (!locationGroups[location]) {
        locationGroups[location] = [];
      }
      locationGroups[location].push(shot);
    });

    // Suggest dates for each location group
    const suggestions = Object.entries(locationGroups).map(([location, shots]) => {
      return `${location}: ${shots.length} shots`;
    }).join('\n');

    alert(`Location Groups:\n\n${suggestions}\n\nTip: Use bulk date assignment to schedule each location group on the same day.`);
  });

  // Auto-schedule shots intelligently
  btnAutoSchedule?.addEventListener('click', () => {
    const startDate = document.getElementById('productionStart')?.value;
    const shootingDays = parseInt(document.getElementById('shootingDays')?.value) || 5;
    
    if (!startDate) {
      alert('Please set a production start date first');
      return;
    }

    // Group shots by location for efficient scheduling
    const locationGroups = {};
    state.shots.forEach(shot => {
      const location = shot.location || 'Unknown Location';
      if (!locationGroups[location]) {
        locationGroups[location] = [];
      }
      locationGroups[location].push(shot);
    });

    // Distribute locations across available days
    const locations = Object.keys(locationGroups);
    let currentDate = new Date(startDate);
    let dayIndex = 0;

    locations.forEach((location, index) => {
      // Skip weekends (simple version)
      while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const dateString = currentDate.toISOString().split('T')[0];
      
      // Apply this date to all shots in this location
      locationGroups[location].forEach(shot => {
        const shotLi = Array.from(shotList.children).find(li => li.dataset.id === shot.id);
        if (shotLi) {
          const shootDateInput = shotLi.querySelector('.shootdate');
          if (shootDateInput) {
            shootDateInput.value = dateString;
            shootDateInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      });

      // Move to next day for next location
      currentDate.setDate(currentDate.getDate() + 1);
    });

    persistFromDOM();
    alert(`Auto-scheduled ${locations.length} locations across ${Math.ceil(locations.length)} days`);
  });

  // Distribute days evenly
  btnDistributeDays?.addEventListener('click', () => {
    const startDate = document.getElementById('productionStart')?.value;
    const endDate = document.getElementById('productionEnd')?.value;
    const shootingDays = parseInt(document.getElementById('shootingDays')?.value);
    
    if (!startDate || !endDate || !shootingDays) {
      alert('Please fill in start date, end date, and number of shooting days');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    
    if (shootingDays > totalDays) {
      alert('Shooting days cannot exceed the total production period');
      return;
    }

    // Calculate interval between shooting days
    const interval = Math.floor(totalDays / shootingDays);
    const dates = [];
    
    for (let i = 0; i < shootingDays; i++) {
      const shootDate = new Date(start);
      shootDate.setDate(start.getDate() + (i * interval));
      dates.push(shootDate.toISOString().split('T')[0]);
    }

    // Show suggested dates
    alert(`Suggested shooting dates:\n\n${dates.map((date, i) => `Day ${i + 1}: ${new Date(date).toLocaleDateString()}`).join('\n')}\n\nUse bulk assignment to apply these dates to your shots.`);
  });
}

function exportCallSheet(date) {
  const shotsForDate = state.shots.filter(shot => shot.shootDate === date);
  
  if (shotsForDate.length === 0) {
    alert('No shots scheduled for this date');
    return;
  }

  // Group by location for the call sheet
  const locationGroups = {};
  shotsForDate.forEach(shot => {
    const location = shot.location || 'Unknown Location';
    if (!locationGroups[location]) {
      locationGroups[location] = [];
    }
    locationGroups[location].push(shot);
  });

  // Generate call sheet data
  const callSheetData = {
    date: new Date(date).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    locations: Object.entries(locationGroups).map(([location, shots]) => ({
      location,
      shotCount: shots.length,
      scenes: [...new Set(shots.map(s => s.scene))],
      cast: [...new Set(shots.flatMap(s => s.chars ? s.chars.split(',').map(c => c.trim()) : []))],
      shots: shots.map(s => ({
        scene: s.scene,
        type: s.type,
        description: s.desc,
        equipment: s.equipment,
        props: s.props
      }))
    }))
  };

  // Create and download call sheet JSON
  const blob = new Blob([JSON.stringify(callSheetData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `call-sheet-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Initialize schedule tools when page loads
document.addEventListener('DOMContentLoaded', initScheduleTools);