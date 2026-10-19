await new Promise(r => setTimeout(r, +(location.hash.slice(1) || 900)));
return 'at ' + (location.hash.slice(1) || 900) + 'ms';
