// --- Production Schedule Rendering ---
function renderProductionSchedule() {
  const scheduleByDateEl = document.getElementById('scheduleByDate');
  const scheduleBySceneEl = document.getElementById('scheduleByScene');
  
  if (!scheduleByDateEl || !scheduleBySceneEl) return;

  // Render By Date & Location view
  const dateGroups = groupByDateAndLocation(state.shots);
  scheduleByDateEl.innerHTML = '';
  
  if (!dateGroups.length) {
    scheduleByDateEl.innerHTML = `
      <div class="p-6 rounded-2xl border border-dashed border-slate-700/80 text-center text-slate-400">
        <p class="text-sm">No shots scheduled yet. Add shooting dates to your storyboard to see the production schedule.</p>
      </div>
    `;
  } else {
    dateGroups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow space-y-3';
      
      const dateDisplay = group.date === 'Unscheduled' ? 
        '📅 Unscheduled' : 
        `📅 ${new Date(group.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
      
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-lg">${dateDisplay}</h3>
            <p class="text-sm text-slate-300">📍 ${group.location}</p>
          </div>
          <div class="text-right text-sm text-slate-400">
            <div>${group.shots.length} shot${group.shots.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        
        <div class="space-y-2">
          <div>
            <h4 class="text-xs uppercase tracking-wide text-slate-500 mb-1">Scene Headings</h4>
            <div class="flex flex-wrap gap-1">
              ${group.sceneHeadings.map(heading => 
                `<span class="px-2 py-1 rounded-lg bg-slate-800/60 text-xs text-slate-300">${heading}</span>`
              ).join('')}
            </div>
          </div>
          
          ${group.actors.length ? `
            <div>
              <h4 class="text-xs uppercase tracking-wide text-slate-500 mb-1">Cast</h4>
              <div class="text-sm text-slate-300">${group.actors.join(', ')}</div>
            </div>
          ` : ''}
          
          ${group.props.length ? `
            <div>
              <h4 class="text-xs uppercase tracking-wide text-slate-500 mb-1">Key Props</h4>
              <div class="text-sm text-slate-300">${group.props.slice(0, 5).join(', ')}${group.props.length > 5 ? '...' : ''}</div>
            </div>
          ` : ''}
        </div>
        
        <details class="mt-3">
          <summary class="cursor-pointer text-xs uppercase tracking-wide text-slate-500 hover:text-slate-300">
            Shot Breakdown (${group.shots.length})
          </summary>
          <div class="mt-2 space-y-1">
            ${group.shots.map(shot => `
              <div class="flex items-center justify-between text-sm bg-slate-950/40 rounded-lg px-3 py-2">
                <span class="text-slate-300">${shot.scene || 'Shot ' + (shot.number || '')}</span>
                <span class="text-slate-500">${shot.type || ''} ${shot.lens || ''}</span>
              </div>
            `).join('')}
          </div>
        </details>
      `;
      
      scheduleByDateEl.appendChild(card);
    });
  }

  // Render By Scene Heading view
  const sceneGroups = groupBySceneHeading(state.shots);
  scheduleBySceneEl.innerHTML = '';
  
  if (!sceneGroups.length) {
    scheduleBySceneEl.innerHTML = `
      <div class="p-6 rounded-2xl border border-dashed border-slate-700/80 text-center text-slate-400">
        <p class="text-sm">No scenes found. Add scene headings to your storyboard shots.</p>
      </div>
    `;
  } else {
    sceneGroups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow space-y-3';
      
      const intExt = group.parsed?.intExt || '';
      const location = group.parsed?.location || '';
      const timeOfDay = group.parsed?.timeOfDay || '';
      
      // Safely escape HTML and ensure proper text wrapping
      const safeHeading = (group.heading || 'Unknown Scene').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-lg break-words whitespace-pre-wrap">${safeHeading}</h3>
            ${intExt || location || timeOfDay ? `
              <p class="text-sm text-slate-400 mt-1">
                ${[intExt, location, timeOfDay].filter(Boolean).join(' • ')}
              </p>
            ` : ''}
          </div>
          <div class="text-right text-sm text-slate-400 flex-shrink-0">
            <div>${group.shots.length} shot${group.shots.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        
        <div class="space-y-2">
          ${group.locations.length ? `
            <div>
              <h4 class="text-xs uppercase tracking-wide text-slate-500 mb-1">Locations</h4>
              <div class="text-sm text-slate-300">${group.locations.join(', ')}</div>
            </div>
          ` : ''}
          
          ${group.shootDates.length ? `
            <div>
              <h4 class="text-xs uppercase tracking-wide text-slate-500 mb-1">Shoot Dates</h4>
              <div class="flex flex-wrap gap-1">
                ${group.shootDates.map(date => 
                  `<span class="px-2 py-1 rounded-lg bg-slate-800/60 text-xs text-slate-300">${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`
                ).join('')}
              </div>
            </div>
          ` : ''}
          
          ${group.actors.length ? `
            <div>
              <h4 class="text-xs uppercase tracking-wide text-slate-500 mb-1">Cast</h4>
              <div class="text-sm text-slate-300">${group.actors.join(', ')}</div>
            </div>
          ` : ''}
          
          ${group.props.length ? `
            <div>
              <h4 class="text-xs uppercase tracking-wide text-slate-500 mb-1">Props</h4>
              <div class="text-sm text-slate-300">${group.props.slice(0, 5).join(', ')}${group.props.length > 5 ? '...' : ''}</div>
            </div>
          ` : ''}
        </div>
        
        <details class="mt-3">
          <summary class="cursor-pointer text-xs uppercase tracking-wide text-slate-500 hover:text-slate-300">
            Shot List (${group.shots.length})
          </summary>
          <div class="mt-2 space-y-1">
            ${group.shots.map(shot => `
              <div class="flex items-center justify-between text-sm bg-slate-950/40 rounded-lg px-3 py-2">
                <span class="text-slate-300">${shot.type || 'Shot'} - ${shot.desc || 'No description'}</span>
                <span class="text-slate-500">${shot.lens || ''} ${shot.move || ''}</span>
              </div>
            `).join('')}
          </div>
        </details>
      `;
      
      scheduleBySceneEl.appendChild(card);
    });
  }
}

// Expose globally
window.renderProductionSchedule = renderProductionSchedule;