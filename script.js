const mapboxAccessToken = 'pk.eyJ1Ijoic3RyYWthemEiLCJhIjoiY21mZTNodDIzMDNlcDJsc2c2Zm9ncWlzcSJ9.FP5em2UBGDStxHkhblyN2w';

const initialCoords = [35.6895, 139.6917]; 
const map = L.map('map', { zoomControl: false }).setView(initialCoords, 11);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

const retroMarkerIcon = L.divIcon({
    className: 'custom-map-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

const marker = L.marker(initialCoords, { icon: retroMarkerIcon, draggable: true }).addTo(map);
marker.bindPopup("STARTING_POINT").openPopup();

let isochroneLayer;

const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions-box');
let geocodingController;

const logConsole = document.getElementById('log-console');
function logToConsole(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `> ${message}`;
    p.className = `log-message ${type}`;
    logConsole.appendChild(p);
    logConsole.scrollTop = logConsole.scrollHeight; 
}

searchInput.addEventListener('input', async (e) => {
    const query = e.target.value;
    if (geocodingController) geocodingController.abort();
    geocodingController = new AbortController();
    
    if (query.length < 3) { 
        suggestionsBox.innerHTML = ''; 
        suggestionsBox.style.display = 'none';
        return; 
    }

    suggestionsBox.style.display = 'block';
    
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxAccessToken}&autocomplete=true&language=en,ru,ja`;

    try {
        const response = await fetch(url, { signal: geocodingController.signal });
        const data = await response.json();
        displaySuggestions(data.features);
    } catch (error) {
        if (error.name !== 'AbortError') console.error("GEOCODING_ERROR:", error);
        suggestionsBox.innerHTML = '';
        suggestionsBox.style.display = 'none';
    }
});

searchInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); 
        getIsochrone();
        suggestionsBox.style.display = 'none';
    }
});

function displaySuggestions(features) {
    suggestionsBox.innerHTML = '';
    if (!features || features.length === 0) {
        suggestionsBox.style.display = 'none';
        return;
    }
    features.forEach(feature => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = feature.place_name;
        item.onclick = () => selectSuggestion(feature);
        suggestionsBox.appendChild(item);
    });
    suggestionsBox.style.display = 'block';
}

function selectSuggestion(feature) {
    searchInput.value = feature.place_name;
    suggestionsBox.innerHTML = '';
    suggestionsBox.style.display = 'none';
    const coords = [feature.center[1], feature.center[0]];
    map.setView(coords, 13);
    marker.setLatLng(coords);
    marker.setPopupContent("STARTING_POINT: " + feature.place_name).openPopup();
    getIsochrone();
}

document.addEventListener('click', (event) => {
    if (!suggestionsBox.contains(event.target) && event.target !== searchInput) {
        suggestionsBox.innerHTML = '';
        suggestionsBox.style.display = 'none';
    }
});

async function getIsochrone() {
    logToConsole("QUERY RECEIVED. INITIATING PROTOCOLS...");
    if (!mapboxAccessToken) {
        const errorMsg = "!_ERROR: MAPBOX ACCESS TOKEN NOT CONFIGURED.";
        alert(errorMsg);
        logToConsole(errorMsg, 'error');
        return;
    }
    
    const executeButton = document.getElementById('execute-button');
    const originalButtonText = executeButton.textContent;
    executeButton.innerHTML = "[ COMPUTING... <span class='loading-spinner'></span> ]";
    executeButton.disabled = true;

    const durationInput = document.getElementById('duration');
    const profileSelect = document.getElementById('profile');
    const profile = profileSelect.value;
    let duration = parseInt(durationInput.value, 10);
    
    logToConsole(`TRANSPORT_PROTOCOL SET TO: ${profileSelect.options[profileSelect.selectedIndex].text}`);
    logToConsole(`TRAVEL_TIME SET TO: ${duration} MINUTES`);

    if (duration > 60) {
        const warningMsg = "!_WARNING: MAX DURATION CAPPED AT 60 MINUTES BY SYSTEM PROTOCOL.";
        alert(warningMsg);
        logToConsole(warningMsg, 'error');
        duration = 60;
        durationInput.value = 60;
    }
    
    let center;
    const query = searchInput.value;

    try {
        let locationName = "CURRENT MARKER POSITION";
        if (query.trim() !== '') {
            logToConsole(`GEOCODING TARGET: "${query}"...`);
            const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxAccessToken}&limit=1`;
            const geoResponse = await fetch(geocodeUrl);
            const geoData = await geoResponse.json();
            if (geoData.features && geoData.features.length > 0) {
                const feature = geoData.features[0];
                locationName = feature.place_name;
                logToConsole(`GEOCODING SUCCESS: ${locationName}`);
                const coords = [feature.center[1], feature.center[0]];
                center = { lat: coords[0], lng: coords[1] };
                marker.setLatLng(center);
                map.setView(center, 13);
            } else {
                throw new Error(`LOCATION "${query}" NOT FOUND IN DATABASE.`);
            }
        } else {
            center = marker.getLatLng();
            locationName = `[${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}]`;
            logToConsole(`USING MARKER COORDINATES: ${locationName}`);
        }

        logToConsole("CONNECTING TO ISOCHRONE SATELLITE API...");
        const isochroneUrl = `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${center.lng},${center.lat}?contours_minutes=${duration}&polygons=true&access_token=${mapboxAccessToken}`;
        const isoResponse = await fetch(isochroneUrl);
        if (!isoResponse.ok) {
            const errorData = await isoResponse.json();
            throw new Error(`API ERROR (${isoResponse.status}): ${errorData.message}`);
        }
        const data = await isoResponse.json();
        logToConsole("DATA RECEIVED. RENDERING POLYGON ON MAP...");
        
        if (isochroneLayer) {
            map.removeLayer(isochroneLayer);
        }
        
        isochroneLayer = L.geoJSON(data, {
            style: () => ({
                color: '#FFFFFF',
                weight: 2,
                opacity: 1,
                fill: false
            })
        }).addTo(map);
        
        map.flyToBounds(isochroneLayer.getBounds());
        logToConsole("OPERATION SUCCESSFUL. STANDING BY.", 'success');

    } catch (error) {
        console.error("EXECUTION FAILED:", error);
        const errorMsg = `!_ERROR: ${error.message}`;
        alert(errorMsg);
        logToConsole(errorMsg, 'error');
    } finally {
        executeButton.innerHTML = originalButtonText;
        executeButton.disabled = false;
    }
}

marker.on('dragend', function(e) {
    searchInput.value = ''; 
    const newLatLng = marker.getLatLng();
    marker.setPopupContent("STARTING_POINT: " + newLatLng.lat.toFixed(4) + ", " + newLatLng.lng.toFixed(4)).openPopup();
    getIsochrone();
});

function typeWriter(elementId, text, speed) {
    let i = 0;
    const target = document.getElementById(elementId);
    if (!target) return;
    target.innerHTML = '';
    function type() {
        if (i < text.length) {
            target.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

window.addEventListener('load', () => {
    const titleText = '[ > SYSTEM_ACCESS : ПРОЕКТ_ИЗОХРОНА // プロジェクト等時線 ]';
    typeWriter('typewriter-text', titleText, 50);

    logToConsole("SYSTEM BOOT COMPLETE. AWAITING COMMAND.");
    getIsochrone();
});